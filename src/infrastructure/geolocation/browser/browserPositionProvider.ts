// Browser GPS adapter (FR-003). Wraps navigator.geolocation.watchPosition. Never fabricates SOG/COG: absent values stay null.
// Foreground only — it does not track after the page is suspended (BACKGROUND_GPS_LIMIT_TEXT).
// Reliability (ADR-048): after a recoverable error (no signal / timeout) the search is restarted with a growing wait, and a silent
// stall (no fix and no error for a while) restarts the watch. A restart never invents a position: the last fix just ages into STALE.
import { metersPerSecondToKnots, toIsoUtc, type VesselPosition } from '../../../domain';
import type { PositionErrorKind, PositionListener, PositionProvider } from '../../../application/ports';

/** Structural subset of the DOM Geolocation API, so tests can pass a fake. */
export interface GeolocationLike {
  watchPosition(
    success: (p: GeolocationPositionLike) => void,
    error: (e: { code: number; message: string }) => void,
    options?: { enableHighAccuracy?: boolean; maximumAge?: number; timeout?: number },
  ): number;
  clearWatch(id: number): void;
}
export interface GeolocationPositionLike {
  readonly coords: {
    readonly latitude: number; readonly longitude: number; readonly accuracy: number;
    readonly speed: number | null; readonly heading: number | null;
  };
  readonly timestamp: number;
}

const finiteOrNull = (v: number | null | undefined): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Pure mapping. Returns null if the fix is unusable (non-finite coordinates/timestamp). Units are converted HERE via domain/units. */
export function mapBrowserFix(p: GeolocationPositionLike): VesselPosition | null {
  const lat = finiteOrNull(p.coords.latitude);
  const lon = finiteOrNull(p.coords.longitude);
  const ts = finiteOrNull(p.timestamp);
  if (lat === null || lon === null || ts === null) return null;

  // m/s → knots. Negative speed is invalid → null (never clamped to 0, which would read as "stationary").
  const speedMs = finiteOrNull(p.coords.speed);
  const sogKnots = speedMs !== null && speedMs >= 0 ? metersPerSecondToKnots(speedMs) : null;
  // Heading is only meaningful when moving; browsers report NaN/null otherwise. Out-of-range → null.
  const heading = finiteOrNull(p.coords.heading);
  const cog = heading !== null && heading >= 0 && heading <= 360 ? heading % 360 : null;
  const acc = finiteOrNull(p.coords.accuracy);

  return {
    latitudeDeg: lat, longitudeDeg: lon,
    accuracyMeters: acc !== null && acc >= 0 ? acc : null,
    // The FIX timestamp, not the time we received it (ADR-018).
    observedAtUtc: toIsoUtc(ts),
    source: 'browser-gps', sogKnots, cogDegreesTrue: cog, isSimulated: false,
  };
}

export function mapGeolocationError(e: { code: number; message: string }): { kind: PositionErrorKind; message: string } {
  switch (e.code) {
    case 1: return { kind: 'permission-denied', message: 'Location permission was denied. Allow location access for this site in the browser settings, then start again.' };
    case 2: return { kind: 'position-unavailable', message: 'The device could not determine its position (no GPS signal or location services off).' };
    case 3: return { kind: 'timeout', message: 'Timed out waiting for a GPS fix.' };
    default: return { kind: 'position-unavailable', message: e.message || 'Unknown geolocation error.' };
  }
}

export interface BrowserEnvironment {
  readonly geolocation: GeolocationLike | undefined;
  readonly isSecureContext: boolean;
}

export function detectBrowserEnvironment(): BrowserEnvironment {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  return {
    geolocation: nav && 'geolocation' in nav ? (nav.geolocation as unknown as GeolocationLike) : undefined,
    isSecureContext: typeof isSecureContext === 'boolean' ? isSecureContext : false,
  };
}

/** Timer port so tests can drive retries without real waiting. Infrastructure may use timers; it never reads the clock. */
export interface TimerApi {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}
export const realTimers: TimerApi = {
  setTimeout: (fn, ms) => {
    const handle = setTimeout(fn, ms);
    (handle as unknown as { unref?: () => void }).unref?.(); // Node only: never keeps a test process alive
    return handle;
  },
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export interface BrowserProviderOptions {
  /** Seconds to wait before restarting the GPS search after a recoverable error; the last value repeats until a fix arrives. */
  readonly retryDelaysSeconds: readonly number[];
  /** Restart the watch silently when neither a fix nor an error arrived for this long. 0 turns it off. */
  readonly silenceRestartSeconds: number;
  readonly timers: TimerApi;
}
export const DEFAULT_BROWSER_PROVIDER_OPTIONS: BrowserProviderOptions = {
  retryDelaysSeconds: [2, 4, 8, 15],
  silenceRestartSeconds: 45,
  timers: realTimers,
};

/** Errors where trying again can help. Permission denied, unsupported and insecure pages are NOT retried (retrying cannot fix them). */
const isRecoverable = (kind: PositionErrorKind): boolean => kind === 'position-unavailable' || kind === 'timeout';

export class BrowserPositionProvider implements PositionProvider {
  readonly kind = 'browser-gps' as const;
  private readonly options: BrowserProviderOptions;
  private active = false;
  private listener: PositionListener | null = null;
  private watchId: number | null = null;
  /** Bumped on every (re)start and stop, so callbacks of an old watch are ignored. */
  private generation = 0;
  /** Consecutive recoverable failures since the last good fix. */
  private failures = 0;
  private retryTimer: unknown = null;
  private watchdogTimer: unknown = null;

  constructor(
    private readonly env: BrowserEnvironment = detectBrowserEnvironment(),
    options: Partial<BrowserProviderOptions> = {},
  ) {
    this.options = { ...DEFAULT_BROWSER_PROVIDER_OPTIONS, ...options };
  }

  start(listener: PositionListener): void {
    if (this.active) return; // never create two watchers
    if (!this.env.geolocation) {
      listener({ type: 'error', kind: 'unsupported', message: 'This browser does not support geolocation.' });
      return;
    }
    if (!this.env.isSecureContext) {
      listener({ type: 'error', kind: 'insecure-context', message: 'Geolocation needs a secure (HTTPS) page. Open the app over HTTPS or on localhost.' });
      return;
    }
    this.active = true;
    this.listener = listener;
    this.failures = 0;
    listener({ type: 'status', status: 'started' });
    this.beginWatch();
  }

  stop(): void {
    if (!this.active) return;
    this.active = false;
    this.listener = null;
    this.generation += 1;
    this.cancelTimers();
    this.clearCurrentWatch();
    // Listener intentionally not called after stop; the controller already knows.
  }

  private beginWatch(): void {
    const geo = this.env.geolocation;
    if (!this.active || !geo) return;
    const gen = (this.generation += 1);
    this.watchId = geo.watchPosition(
      (p) => {
        if (gen !== this.generation) return;
        this.armWatchdog();
        const fix = mapBrowserFix(p);
        if (fix) {
          this.failures = 0;
          this.emit({ type: 'position', position: fix });
        } else {
          this.emit({ type: 'error', kind: 'invalid-fix', message: 'The device reported a fix with invalid coordinates or time; it was ignored.' });
        }
      },
      (e) => {
        if (gen !== this.generation) return;
        const m = mapGeolocationError(e);
        if (!isRecoverable(m.kind)) {
          // Retrying cannot help (e.g. permission denied). Stop the silent restarts too; the user fixes the cause and taps Try GPS again.
          this.cancelTimers();
          this.emit({ type: 'error', kind: m.kind, message: m.message });
          return;
        }
        const delays = this.options.retryDelaysSeconds;
        const delaySeconds = delays.length === 0 ? 5 : (delays[Math.min(this.failures, delays.length - 1)] as number);
        this.failures += 1;
        this.emit({ type: 'error', kind: m.kind, message: m.message, retry: { attempt: this.failures, inSeconds: delaySeconds } });
        this.restartAfter(delaySeconds);
      },
      // maximumAge 0: never accept a cached fix as new. timeout: report instead of waiting silently.
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
    );
    this.armWatchdog();
  }

  /** Drop the current watch and start a new one after the wait. Callbacks of the dropped watch are ignored (generation bump). */
  private restartAfter(seconds: number): void {
    this.generation += 1;
    this.cancelTimers();
    this.clearCurrentWatch();
    this.retryTimer = this.options.timers.setTimeout(() => {
      this.retryTimer = null;
      this.beginWatch();
    }, seconds * 1000);
  }

  /** Re-armed on every callback. Fires only after a silent stall: restarts the watch without reporting an error. */
  private armWatchdog(): void {
    if (this.watchdogTimer !== null) { this.options.timers.clearTimeout(this.watchdogTimer); this.watchdogTimer = null; }
    const seconds = this.options.silenceRestartSeconds;
    if (!this.active || seconds <= 0) return;
    this.watchdogTimer = this.options.timers.setTimeout(() => {
      this.watchdogTimer = null;
      if (!this.active) return;
      this.generation += 1;
      this.clearCurrentWatch();
      this.beginWatch();
    }, seconds * 1000);
  }

  private cancelTimers(): void {
    if (this.retryTimer !== null) { this.options.timers.clearTimeout(this.retryTimer); this.retryTimer = null; }
    if (this.watchdogTimer !== null) { this.options.timers.clearTimeout(this.watchdogTimer); this.watchdogTimer = null; }
  }

  private clearCurrentWatch(): void {
    if (this.watchId === null) return;
    this.env.geolocation?.clearWatch(this.watchId);
    this.watchId = null;
  }

  private emit(event: Parameters<PositionListener>[0]): void {
    this.listener?.(event);
  }
}
