// Deterministic route-replay simulator (FR-004). Every position it emits has isSimulated = true; the UI must show SIMULATED.
// Same config → same fixes. No randomness, no real clock: simulated time derives from `startUtc` + step count.
import {
  initialBearingDeg, MS_PER_HOUR, parseIsoUtc, pointAtRouteDistance, toIsoUtc,
  type LonLat, type Route, type VesselPosition,
} from '../../../domain';
import type { PositionListener, PositionProvider } from '../../../application/ports';

export interface SimulatorConfig {
  readonly route: Route;
  /** Simulated time of step 0 (ISO UTC). */
  readonly startUtc: string;
  readonly speedKnots: number;
  /** Simulated seconds between fixes. */
  readonly stepSeconds: number;
  /** Where on the route (nm from its start) the replay begins. */
  readonly startAlongRouteNm: number;
  readonly accuracyMeters: number;
  /** Set false to simulate a source that reports no SOG / COG (so ETA must be unavailable, not guessed). */
  readonly reportSog: boolean;
  readonly reportCog: boolean;
}

export function defaultSimulatorConfig(route: Route, startUtc: string): SimulatorConfig {
  return { route, startUtc, speedKnots: 12, stepSeconds: 10, startAlongRouteNm: 0, accuracyMeters: 5, reportSog: true, reportCog: true };
}

export type SimulatorValidation = { readonly ok: true } | { readonly ok: false; readonly explanation: string };

export function validateSimulatorConfig(c: SimulatorConfig): SimulatorValidation {
  if (parseIsoUtc(c.startUtc) === null) return { ok: false, explanation: 'startUtc must be an ISO UTC timestamp.' };
  if (!Number.isFinite(c.speedKnots) || c.speedKnots <= 0) return { ok: false, explanation: 'speedKnots must be > 0.' };
  if (!Number.isFinite(c.stepSeconds) || c.stepSeconds <= 0) return { ok: false, explanation: 'stepSeconds must be > 0.' };
  if (!Number.isFinite(c.startAlongRouteNm) || c.startAlongRouteNm < 0 || c.startAlongRouteNm > c.route.totalNm) {
    return { ok: false, explanation: 'startAlongRouteNm must be within the route.' };
  }
  if (!Number.isFinite(c.accuracyMeters) || c.accuracyMeters < 0) return { ok: false, explanation: 'accuracyMeters must be >= 0.' };
  return { ok: true };
}

/** Simulated "now" at a step. */
export function simulatedTimeAtStep(c: SimulatorConfig, step: number): string {
  return toIsoUtc((parseIsoUtc(c.startUtc) as number) + step * c.stepSeconds * 1000);
}

export interface SimulatedStep {
  readonly position: VesselPosition;
  readonly alongRouteNm: number;
  /** True once the replay has reached the end of the route. */
  readonly finished: boolean;
}

/** Pure: the fix at a given step. */
export function simulateStep(c: SimulatorConfig, step: number): SimulatedStep {
  // distance = speed × time, using the domain's unit conversions (kn → m/s → nm) would be circular; kn·h is direct.
  const hours = (step * c.stepSeconds * 1000) / MS_PER_HOUR;
  const raw = c.startAlongRouteNm + c.speedKnots * hours;
  const along = Math.min(raw, c.route.totalNm);
  const here = pointAtRouteDistance(c.route, along) as LonLat;
  // COG = true bearing of the route over a short look-ahead (look BACK at the very end so the bearing stays defined).
  const a = pointAtRouteDistance(c.route, Math.max(0, Math.min(along, c.route.totalNm - 0.05))) as LonLat;
  const b = pointAtRouteDistance(c.route, Math.min(c.route.totalNm, Math.max(along, 0.05) + 0.05)) as LonLat;
  const cog = (initialBearingDeg(a, b) + 360) % 360;
  return {
    alongRouteNm: along,
    finished: raw >= c.route.totalNm,
    position: {
      latitudeDeg: here[1], longitudeDeg: here[0], accuracyMeters: c.accuracyMeters,
      observedAtUtc: simulatedTimeAtStep(c, step), source: 'simulator',
      sogKnots: c.reportSog ? c.speedKnots : null, cogDegreesTrue: c.reportCog ? cog : null, isSimulated: true,
    },
  };
}

/** Injected timer functions so tests never wait on real time. */
export interface Scheduler {
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}
export const realScheduler: Scheduler = {
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>),
};

export class SimulatorPositionProvider implements PositionProvider {
  readonly kind = 'simulator' as const;
  private step = 0;
  private handle: unknown = null;

  /**
   * @param realIntervalMs real milliseconds between emitted fixes
   * Each emission advances SIMULATED time by `stepSeconds`; fast-forward by lowering realIntervalMs. Pass `simulatedNowUtc` as the
   * MonitoringController clock so fix age is measured in simulated time.
   */
  constructor(
    private readonly config: SimulatorConfig,
    private readonly realIntervalMs: number = 1000,
    private readonly scheduler: Scheduler = realScheduler,
  ) {
    const v = validateSimulatorConfig(config);
    if (!v.ok) throw new RangeError(v.explanation);
  }

  /** Simulated clock: the time of the most recently emitted fix (or the start time before any fix). */
  simulatedNowUtc = (): string => simulatedTimeAtStep(this.config, Math.max(0, this.step - 1));

  start(listener: PositionListener): void {
    if (this.handle !== null) return;
    listener({ type: 'status', status: 'started' });
    let finished = false;
    const emit = (): void => {
      const s = simulateStep(this.config, this.step);
      this.step += 1;
      listener({ type: 'position', position: s.position });
      if (s.finished) {
        finished = true;
        this.stop();
        listener({ type: 'status', status: 'finished' });
      }
    };
    emit(); // first fix immediately
    if (!finished) this.handle = this.scheduler.setInterval(emit, this.realIntervalMs);
  }

  stop(): void {
    if (this.handle !== null) { this.scheduler.clearInterval(this.handle); this.handle = null; }
  }
}
