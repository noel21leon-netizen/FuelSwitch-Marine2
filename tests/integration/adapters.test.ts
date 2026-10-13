// FR-003 / FR-004 / FR-008 adapters, tested with fakes: no GPS, network, clock or timers.
import { describe, it, expect } from 'vitest';
import { assessPosition, DEFAULT_DOMAIN_SETTINGS, type AlertDue } from '../../src/domain';
import type { PositionEvent } from '../../src/application/ports';
import {
  BrowserPositionProvider, mapBrowserFix, mapGeolocationError,
  type GeolocationLike, type GeolocationPositionLike,
} from '../../src/infrastructure/geolocation/browser/browserPositionProvider';
import {
  defaultSimulatorConfig, simulateStep, SimulatorPositionProvider, simulatedTimeAtStep, validateSimulatorConfig,
  type Scheduler, type SimulatorConfig,
} from '../../src/infrastructure/geolocation/simulator/routeReplaySimulator';
import {
  BrowserNotificationProvider, type NotificationEnvironment, type NotificationOptionsLike,
} from '../../src/infrastructure/notifications/browser/browserNotificationProvider';
import { loadDemoDataset, loadDemoRoute, type FetchJson } from '../../src/infrastructure/regulatory-data/local/localDatasetLoader';
import { DEMO_BANNER_TEXT } from '../../src/shared/constants';
import { EQ_ROUTE, NOW, readRepoJson } from '../fixtures';

// ---------- browser GPS ----------
const T0 = Date.UTC(2026, 9, 12, 6, 0, 0); // 2026-10-12T06:00:00Z
const raw = (over: Partial<GeolocationPositionLike['coords']> = {}, timestamp = T0): GeolocationPositionLike => ({
  coords: { latitude: 0.5, longitude: -1, accuracy: 8, speed: null, heading: null, ...over }, timestamp,
});

describe('mapBrowserFix', () => {
  it('converts m/s to knots in the adapter (12 kn = 6.17333 m/s)', () => {
    const f = mapBrowserFix(raw({ speed: (12 * 1852) / 3600 }));
    expect(f?.sogKnots).toBeCloseTo(12, 6);
  });
  it('keeps missing speed / heading as null — never 0, never invented', () => {
    const f = mapBrowserFix(raw({ speed: null, heading: null }));
    expect(f?.sogKnots).toBeNull();
    expect(f?.cogDegreesTrue).toBeNull();
    expect(mapBrowserFix(raw({ speed: Number.NaN, heading: Number.NaN }))?.sogKnots).toBeNull();
  });
  it('treats negative speed and out-of-range heading as unavailable', () => {
    expect(mapBrowserFix(raw({ speed: -1 }))?.sogKnots).toBeNull();
    expect(mapBrowserFix(raw({ heading: 370 }))?.cogDegreesTrue).toBeNull();
    expect(mapBrowserFix(raw({ heading: -5 }))?.cogDegreesTrue).toBeNull();
  });
  it('maps heading 360 to 0 and keeps a normal heading', () => {
    expect(mapBrowserFix(raw({ heading: 360 }))?.cogDegreesTrue).toBe(0);
    expect(mapBrowserFix(raw({ heading: 87.5 }))?.cogDegreesTrue).toBe(87.5);
  });
  it('uses the FIX timestamp as ISO UTC, labels the source and is not simulated', () => {
    const f = mapBrowserFix(raw());
    expect(f?.observedAtUtc).toBe('2026-10-12T06:00:00.000Z');
    expect(f?.source).toBe('browser-gps');
    expect(f?.isSimulated).toBe(false);
  });
  it('keeps unknown accuracy as null rather than 0', () => {
    expect(mapBrowserFix(raw({ accuracy: Number.NaN }))?.accuracyMeters).toBeNull();
    expect(mapBrowserFix(raw({ accuracy: -3 }))?.accuracyMeters).toBeNull();
  });
  it('returns null for non-finite coordinates or timestamp', () => {
    expect(mapBrowserFix(raw({ latitude: Number.NaN }))).toBeNull();
    expect(mapBrowserFix(raw({ longitude: Number.POSITIVE_INFINITY }))).toBeNull();
    expect(mapBrowserFix(raw({}, Number.NaN))).toBeNull();
  });
  it('an out-of-range latitude is passed on and then rejected by domain validation (not silently fixed)', () => {
    const f = mapBrowserFix(raw({ latitude: 95 }));
    const a = assessPosition(f, '2026-10-12T06:00:00Z', DEFAULT_DOMAIN_SETTINGS);
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.reason).toBe('invalid-coordinates');
  });
});

describe('mapGeolocationError', () => {
  it('maps the three standard codes and an unknown one', () => {
    expect(mapGeolocationError({ code: 1, message: '' }).kind).toBe('permission-denied');
    expect(mapGeolocationError({ code: 2, message: '' }).kind).toBe('position-unavailable');
    expect(mapGeolocationError({ code: 3, message: '' }).kind).toBe('timeout');
    expect(mapGeolocationError({ code: 99, message: 'odd' })).toEqual({ kind: 'position-unavailable', message: 'odd' });
  });
  it('gives the user an actionable sentence for permission denied', () => {
    expect(mapGeolocationError({ code: 1, message: '' }).message).toMatch(/permission/i);
  });
});

class FakeGeolocation implements GeolocationLike {
  watches = 0; cleared: number[] = []; lastOptions: { maximumAge?: number; enableHighAccuracy?: boolean; timeout?: number } | undefined;
  onOk: ((p: GeolocationPositionLike) => void) | null = null;
  onErr: ((e: { code: number; message: string }) => void) | null = null;
  watchPosition(ok: (p: GeolocationPositionLike) => void, err: (e: { code: number; message: string }) => void, o?: { maximumAge?: number; enableHighAccuracy?: boolean; timeout?: number }): number {
    this.watches += 1; this.onOk = ok; this.onErr = err; this.lastOptions = o; return 42;
  }
  clearWatch(id: number): void { this.cleared.push(id); }
}
const collect = (): { events: PositionEvent[]; listener: (e: PositionEvent) => void } => {
  const events: PositionEvent[] = [];
  return { events, listener: (e) => { events.push(e); } };
};

describe('BrowserPositionProvider', () => {
  it('reports unsupported when there is no geolocation API', () => {
    const { events, listener } = collect();
    new BrowserPositionProvider({ geolocation: undefined, isSecureContext: true }).start(listener);
    expect(events).toEqual([{ type: 'error', kind: 'unsupported', message: expect.stringMatching(/not support/) }]);
  });
  it('reports an insecure context instead of calling the API', () => {
    const geo = new FakeGeolocation();
    const { events, listener } = collect();
    new BrowserPositionProvider({ geolocation: geo, isSecureContext: false }).start(listener);
    expect(geo.watches).toBe(0);
    expect(events[0]).toMatchObject({ type: 'error', kind: 'insecure-context' });
  });
  it('watches with high accuracy, no cached fixes, emits mapped fixes and errors', () => {
    const geo = new FakeGeolocation();
    const { events, listener } = collect();
    new BrowserPositionProvider({ geolocation: geo, isSecureContext: true }).start(listener);
    expect(geo.lastOptions?.maximumAge).toBe(0);
    expect(geo.lastOptions?.enableHighAccuracy).toBe(true);
    geo.onOk?.(raw({ speed: 5 }));
    geo.onErr?.({ code: 1, message: '' });
    expect(events.map((e) => e.type)).toEqual(['status', 'position', 'error']);
    const err = events[2];
    if (err?.type !== 'error') throw new Error('expected error');
    expect(err.kind).toBe('permission-denied');
  });
  it('reports an invalid fix as an error instead of emitting a made-up position', () => {
    const geo = new FakeGeolocation();
    const { events, listener } = collect();
    new BrowserPositionProvider({ geolocation: geo, isSecureContext: true }).start(listener);
    geo.onOk?.(raw({ latitude: Number.NaN }));
    expect(events.filter((e) => e.type === 'position')).toHaveLength(0);
    expect(events[1]).toMatchObject({ type: 'error', kind: 'invalid-fix' });
  });
  it('never creates two watchers and clears the watch on stop', () => {
    const geo = new FakeGeolocation();
    const p = new BrowserPositionProvider({ geolocation: geo, isSecureContext: true });
    p.start(() => undefined); p.start(() => undefined);
    expect(geo.watches).toBe(1);
    p.stop(); p.stop();
    expect(geo.cleared).toEqual([42]);
  });
});

// ---------- simulator ----------
const SIM_START = '2026-10-12T00:00:00Z';
const simCfg = (over: Partial<SimulatorConfig> = {}): SimulatorConfig => ({ ...defaultSimulatorConfig(EQ_ROUTE, SIM_START), ...over });

describe('simulateStep (deterministic)', () => {
  it('moves speed × time along the route: 12 kn for 1 h = 12 nm east on the equator', () => {
    const s = simulateStep(simCfg(), 360); // 360 × 10 s = 1 h
    expect(s.alongRouteNm).toBeCloseTo(12, 9);
    expect(s.position.latitudeDeg).toBeCloseTo(0, 9);
    expect(s.position.longitudeDeg).toBeCloseTo(-2 + 12 / 60.0405, 4);
    expect(s.position.cogDegreesTrue).toBeCloseTo(90, 2);
    expect(s.position.observedAtUtc).toBe('2026-10-12T01:00:00.000Z');
    expect(s.finished).toBe(false);
  });
  it('gives identical output for identical input', () => {
    expect(simulateStep(simCfg(), 123)).toEqual(simulateStep(simCfg(), 123));
  });
  it('is always labelled simulated', () => {
    const p = simulateStep(simCfg(), 0).position;
    expect(p.isSimulated).toBe(true);
    expect(p.source).toBe('simulator');
  });
  it('clamps at the end of the route and reports finished', () => {
    const s = simulateStep(simCfg({ startAlongRouteNm: 240.1 }), 3);
    expect(s.finished).toBe(true);
    expect(s.alongRouteNm).toBeCloseTo(EQ_ROUTE.totalNm, 9);
    expect(s.position.longitudeDeg).toBeCloseTo(2, 6);
  });
  it('can simulate a source with no SOG or COG (they stay null)', () => {
    const p = simulateStep(simCfg({ reportSog: false, reportCog: false }), 5).position;
    expect(p.sogKnots).toBeNull();
    expect(p.cogDegreesTrue).toBeNull();
  });
  it('simulated time advances by stepSeconds', () => {
    expect(simulatedTimeAtStep(simCfg({ stepSeconds: 60 }), 2)).toBe('2026-10-12T00:02:00.000Z');
  });
});

describe('validateSimulatorConfig', () => {
  it('rejects bad values with an explanation', () => {
    for (const bad of [{ speedKnots: 0 }, { stepSeconds: -1 }, { startAlongRouteNm: 999 }, { startUtc: 'nope' }, { accuracyMeters: -1 }]) {
      const v = validateSimulatorConfig(simCfg(bad));
      expect(v.ok).toBe(false);
    }
    expect(validateSimulatorConfig(simCfg()).ok).toBe(true);
  });
  it('the provider refuses an invalid config', () => {
    expect(() => new SimulatorPositionProvider(simCfg({ speedKnots: 0 }))).toThrow(/speedKnots/);
  });
});

class FakeScheduler implements Scheduler {
  fn: (() => void) | null = null; cleared = 0; started = 0;
  setInterval(fn: () => void): unknown { this.fn = fn; this.started += 1; return 7; }
  clearInterval(): void { this.fn = null; this.cleared += 1; }
  tick(): void { this.fn?.(); }
}

describe('SimulatorPositionProvider', () => {
  it('emits a first fix immediately, then one per tick, and exposes a simulated clock', () => {
    const sch = new FakeScheduler();
    const p = new SimulatorPositionProvider(simCfg({ stepSeconds: 60 }), 1000, sch);
    const { events, listener } = collect();
    p.start(listener);
    expect(events.map((e) => e.type)).toEqual(['status', 'position']);
    expect(p.simulatedNowUtc()).toBe('2026-10-12T00:00:00.000Z');
    sch.tick(); sch.tick();
    expect(events.filter((e) => e.type === 'position')).toHaveLength(3);
    expect(p.simulatedNowUtc()).toBe('2026-10-12T00:02:00.000Z');
  });
  it('starts only one timer and stops it', () => {
    const sch = new FakeScheduler();
    const p = new SimulatorPositionProvider(simCfg(), 1000, sch);
    p.start(() => undefined); p.start(() => undefined);
    expect(sch.started).toBe(1);
    p.stop();
    expect(sch.cleared).toBe(1);
  });
  it('emits "finished" and stops the timer at the end of the route', () => {
    const sch = new FakeScheduler();
    const p = new SimulatorPositionProvider(simCfg({ startAlongRouteNm: 240.1 }), 1000, sch);
    const { events, listener } = collect();
    p.start(listener);
    sch.tick(); sch.tick();
    expect(events.some((e) => e.type === 'status' && e.status === 'finished')).toBe(true);
    expect(sch.cleared).toBe(1);
  });
});

// ---------- notifications ----------
class FakeNotifEnv implements NotificationEnvironment {
  supported = true; perm: 'granted' | 'denied' | 'default' = 'granted'; swResult = true; swThrows = false; directThrows = false;
  swCalls: { title: string; options: NotificationOptionsLike }[] = []; directCalls: { title: string; options: NotificationOptionsLike }[] = [];
  permission(): 'granted' | 'denied' | 'default' { return this.perm; }
  async requestPermission(): Promise<'granted' | 'denied' | 'default'> { this.perm = 'granted'; return this.perm; }
  async showViaServiceWorker(title: string, options: NotificationOptionsLike): Promise<boolean> {
    if (this.swThrows) throw new Error('sw boom');
    this.swCalls.push({ title, options }); return this.swResult;
  }
  showDirect(title: string, options: NotificationOptionsLike): void {
    if (this.directThrows) throw new Error('constructor not allowed');
    this.directCalls.push({ title, options });
  }
}
const ALERT: AlertDue = {
  id: 'threshold:30:x', kind: 'threshold', thresholdMinutes: 30, minutesUntilPlannedStart: 29, plannedStartAtUtc: NOW,
  message: '[SIMULATED] Planned changeover start in about 29 min (30-min alert). Advisory only.', labels: ['SIMULATED'],
};

describe('BrowserNotificationProvider', () => {
  it('reports unsupported and does not throw', async () => {
    const env = new FakeNotifEnv(); env.supported = false;
    const p = new BrowserNotificationProvider(env);
    expect(p.permission()).toBe('unsupported');
    expect(await p.requestPermission()).toBe('unsupported');
    const r = await p.show(ALERT);
    expect(r).toMatchObject({ delivered: false, reason: 'unsupported' });
  });
  it('does not show anything without granted permission', async () => {
    const env = new FakeNotifEnv(); env.perm = 'denied';
    const r = await new BrowserNotificationProvider(env).show(ALERT);
    expect(r).toMatchObject({ delivered: false, reason: 'permission-not-granted' });
    expect(env.swCalls.length + env.directCalls.length).toBe(0);
  });
  it('prefers the service-worker path and tags the notification with the alert id', async () => {
    const env = new FakeNotifEnv();
    const r = await new BrowserNotificationProvider(env).show(ALERT);
    expect(r).toEqual({ delivered: true });
    expect(env.swCalls[0]?.options.tag).toBe(ALERT.id);
    expect(env.swCalls[0]?.options.body).toBe(ALERT.message);
    expect(env.directCalls).toHaveLength(0);
  });
  it('falls back to the direct constructor when no service worker is registered, or when it throws', async () => {
    const a = new FakeNotifEnv(); a.swResult = false;
    expect(await new BrowserNotificationProvider(a).show(ALERT)).toEqual({ delivered: true });
    expect(a.directCalls).toHaveLength(1);
    const b = new FakeNotifEnv(); b.swThrows = true;
    expect(await new BrowserNotificationProvider(b).show(ALERT)).toEqual({ delivered: true });
    expect(b.directCalls).toHaveLength(1);
  });
  it('reports failure with the browser reason when every path fails', async () => {
    const env = new FakeNotifEnv(); env.swResult = false; env.directThrows = true;
    const r = await new BrowserNotificationProvider(env).show(ALERT);
    expect(r).toMatchObject({ delivered: false, reason: 'failed', detail: 'constructor not allowed' });
  });
  it('requestPermission returns the new state', async () => {
    const env = new FakeNotifEnv(); env.perm = 'default';
    expect(await new BrowserNotificationProvider(env).requestPermission()).toBe('granted');
  });
});

// ---------- local dataset loader ----------
const repoFetch: FetchJson = async (url) => readRepoJson(url.replace(/^\.\//, 'public/'));

describe('local dataset loader (bundled synthetic data)', () => {
  it('loads the synthetic ECA dataset with its DEMO status and notice', async () => {
    const r = await loadDemoDataset(repoFetch);
    if (!r.ok) throw new Error(r.errors.join('; '));
    expect(r.value.verificationStatus).toBe('synthetic');
    expect(r.value.notice).toBe(DEMO_BANNER_TEXT);
    expect(r.value.polygons).toHaveLength(1);
  });
  it('loads the synthetic route', async () => {
    const r = await loadDemoRoute(repoFetch);
    if (!r.ok) throw new Error(r.errors.join('; '));
    expect(r.value.points).toHaveLength(4);
    expect(r.value.totalNm).toBeGreaterThan(300);
  });
  it('reports a fetch failure as a value with the URL context', async () => {
    const r = await loadDemoDataset(async () => { throw new Error('offline'); });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/offline/);
  });
  it('rejects a route file that is not a LineString', async () => {
    const r = await loadDemoRoute(async () => ({ type: 'FeatureCollection', features: [{ geometry: { type: 'Point', coordinates: [0, 0] } }] }));
    expect(r.ok).toBe(false);
  });
  it('rejects a dataset with missing metadata instead of guessing', async () => {
    const r = await loadDemoDataset(async () => ({ type: 'FeatureCollection', features: [] }));
    expect(r.ok).toBe(false);
  });
});
