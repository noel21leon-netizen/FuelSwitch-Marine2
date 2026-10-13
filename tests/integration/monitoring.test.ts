// Monitoring use-case integration (FR-001/003/004/005/006/008): provider fakes → controller → snapshot, with an INJECTED clock.
// Hand-derived timeline (EQ_ROUTE + SQUARE, 12 kn, duration 20 min + margin 10 min = 30 min lead):
//   entry at along 2° × 60.0405 = 120.081 nm → remaining/12 h → minutes until planned start at step k (60 s steps)
//   m_k = 120.081/12·60 − 30 − k = 570.405 − k   →  thresholds 60/30/15/5 reached at k = 511 / 541 / 556 / 566,
//   planned start passes at k = 571 (overdue).
import { describe, it, expect } from 'vitest';
import { toIsoUtc, parseIsoUtc, type VesselPosition } from '../../src/domain';
import type { NotificationDelivery, NotificationProvider, PositionEvent, PositionListener, PositionProvider } from '../../src/application/ports';
import {
  defaultMonitoringConfig, MonitoringController, type MonitoringConfig, type MonitoringSnapshot,
} from '../../src/application/use-cases/monitoring';
import { defaultSimulatorConfig, SimulatorPositionProvider, type Scheduler } from '../../src/infrastructure/geolocation/simulator/routeReplaySimulator';
import { dataset, EQ_ROUTE, NOW, position } from '../fixtures';

const flush = (): Promise<void> => new Promise((r) => setImmediate(r));

class ManualProvider implements PositionProvider {
  readonly kind = 'browser-gps' as const;
  starts = 0; stops = 0; listener: PositionListener | null = null;
  start(l: PositionListener): void { this.starts += 1; this.listener = l; }
  stop(): void { this.stops += 1; }
  emit(e: PositionEvent): void { this.listener?.(e); }
}
class FakeNotifier implements NotificationProvider {
  shown: string[] = []; perm: 'granted' | 'denied' = 'granted';
  permission(): 'granted' | 'denied' { return this.perm; }
  async requestPermission(): Promise<'granted' | 'denied'> { return this.perm; }
  async show(a: { id: string; message: string }): Promise<NotificationDelivery> {
    if (this.perm !== 'granted') return { delivered: false, reason: 'permission-not-granted', detail: 'denied' };
    this.shown.push(a.id); return { delivered: true };
  }
}
class FakeScheduler implements Scheduler {
  fn: (() => void) | null = null;
  setInterval(fn: () => void): unknown { this.fn = fn; return 1; }
  clearInterval(): void { this.fn = null; }
  tick(): void { this.fn?.(); }
}

const baseConfig = (over: Partial<MonitoringConfig> = {}): MonitoringConfig =>
  defaultMonitoringConfig({ route: EQ_ROUTE, dataset: dataset(), durationMinutes: 20, marginMinutes: 10, ...over });

const fix = (over: Partial<VesselPosition> = {}): VesselPosition => position({ longitudeDeg: -1, latitudeDeg: 0, ...over });

describe('end-to-end simulated approach', () => {
  it('raises 60/30/15/5-minute alerts exactly once each, then one overdue alert, with SIMULATED labels', async () => {
    const sch = new FakeScheduler();
    const sim = new SimulatorPositionProvider({ ...defaultSimulatorConfig(EQ_ROUTE, '2026-10-12T00:00:00Z'), stepSeconds: 60, speedKnots: 12 }, 1000, sch);
    const notifier = new FakeNotifier();
    const c = new MonitoringController({ provider: sim, notifier, clock: sim.simulatedNowUtc, config: baseConfig() });
    const seen: { kind: string; threshold: number | null; step: number; message: string; delivery: string }[] = [];
    let step = 0;
    c.subscribe((s) => { for (const a of s.newAlerts) seen.push({ kind: a.alert.kind, threshold: a.alert.thresholdMinutes, step, message: a.alert.message, delivery: a.delivery }); });

    c.start(); await flush();
    for (step = 1; step <= 620; step++) { sch.tick(); await flush(); }

    expect(seen.map((s) => `${s.kind}:${s.threshold}`)).toEqual(['threshold:60', 'threshold:30', 'threshold:15', 'threshold:5', 'start-overdue:null']);
    expect(seen.map((s) => s.step)).toEqual([511, 541, 556, 566, 571]);
    expect(seen.every((s) => s.delivery === 'notified')).toBe(true);
    expect(seen[0]?.message).toMatch(/SIMULATED/);
    expect(notifier.shown).toHaveLength(5);
    c.stop();
  });

  it('shows SIMULATED and a sensible ETA/plan on the first fix', async () => {
    const sch = new FakeScheduler();
    const sim = new SimulatorPositionProvider({ ...defaultSimulatorConfig(EQ_ROUTE, '2026-10-12T00:00:00Z'), startAlongRouteNm: 60.0405 }, 1000, sch);
    const c = new MonitoringController({ provider: sim, notifier: null, clock: sim.simulatedNowUtc, config: baseConfig() });
    c.start(); await flush();
    const s = c.snapshot as MonitoringSnapshot;
    expect(s.badge).toBe('SIMULATED');
    if (s.eta.status !== 'available') throw new Error('eta expected');
    expect(s.eta.remainingDistanceNm).toBeCloseTo(60.0405, 3);
    expect(s.eta.timeToCrossingHours).toBeCloseTo(60.0405 / 12, 4);
    if (s.plan.status !== 'available') throw new Error('plan expected');
    expect(s.plan.minutesUntilPlannedStart).toBeCloseTo((60.0405 / 12) * 60 - 30, 2);
  });
});

describe('degraded inputs never produce numbers', () => {
  it('permission denied with no fix → UNAVAILABLE, error shown, ETA unavailable (no-position)', async () => {
    const p = new ManualProvider();
    const c = new MonitoringController({ provider: p, notifier: null, clock: () => NOW, config: baseConfig() });
    c.start();
    p.emit({ type: 'error', kind: 'permission-denied', message: 'denied' }); await flush();
    const s = c.snapshot as MonitoringSnapshot;
    expect(s.badge).toBe('UNAVAILABLE');
    expect(s.providerError?.kind).toBe('permission-denied');
    expect(s.lastFix).toBeNull();
    expect(s.eta.status).toBe('unavailable');
    if (s.eta.status === 'unavailable') expect(s.eta.reason).toBe('no-position');
    expect(s.plan.status).toBe('unavailable');
  });

  it('a fix that ages past the limit becomes STALE on tick, with no new fix needed', async () => {
    const p = new ManualProvider();
    let now = NOW;
    const c = new MonitoringController({ provider: p, notifier: null, clock: () => now, config: baseConfig() });
    c.start();
    p.emit({ type: 'position', position: fix() }); await flush();
    expect((c.snapshot as MonitoringSnapshot).badge).toBe('SIMULATED'); // fixture fixes are simulated
    now = toIsoUtc((parseIsoUtc(NOW) as number) + 31_000);
    const s = await c.tick();
    expect(s.badge).toBe('STALE');
    expect(s.lastFix).not.toBeNull();
    expect(s.eta.status).toBe('unavailable');
    if (s.eta.status === 'unavailable') expect(s.eta.reason).toBe('stale-fix');
  });

  it('a live (non-simulated) fix shows LIVE', async () => {
    const p = new ManualProvider();
    const c = new MonitoringController({ provider: p, notifier: null, clock: () => NOW, config: baseConfig() });
    c.start();
    p.emit({ type: 'position', position: fix({ isSimulated: false, source: 'browser-gps' }) }); await flush();
    expect((c.snapshot as MonitoringSnapshot).badge).toBe('LIVE');
  });

  it('a provider error after a good fix keeps the old fix visible and the error alongside; the next fix clears the error', async () => {
    const p = new ManualProvider();
    const c = new MonitoringController({ provider: p, notifier: null, clock: () => NOW, config: baseConfig() });
    c.start();
    p.emit({ type: 'position', position: fix() }); await flush();
    p.emit({ type: 'error', kind: 'timeout', message: 'timed out' }); await flush();
    let s = c.snapshot as MonitoringSnapshot;
    expect(s.providerError?.kind).toBe('timeout');
    expect(s.lastFix).not.toBeNull();
    p.emit({ type: 'position', position: fix() }); await flush();
    s = c.snapshot as MonitoringSnapshot;
    expect(s.providerError).toBeNull();
  });

  it('a source without SOG gives ETA unavailable (sog-missing), not a guessed speed', async () => {
    const p = new ManualProvider();
    const c = new MonitoringController({ provider: p, notifier: null, clock: () => NOW, config: baseConfig() });
    c.start();
    p.emit({ type: 'position', position: fix({ sogKnots: null }) }); await flush();
    const s = c.snapshot as MonitoringSnapshot;
    if (s.eta.status !== 'unavailable') throw new Error('expected unavailable');
    expect(s.eta.reason).toBe('sog-missing');
  });

  it('poor accuracy → UNAVAILABLE with the accuracy reason', async () => {
    const p = new ManualProvider();
    const c = new MonitoringController({ provider: p, notifier: null, clock: () => NOW, config: baseConfig() });
    c.start();
    p.emit({ type: 'position', position: fix({ accuracyMeters: 500 }) }); await flush();
    const s = c.snapshot as MonitoringSnapshot;
    expect(s.badge).toBe('UNAVAILABLE');
    if (s.position.ok) throw new Error('expected rejected');
    expect(s.position.reason).toBe('poor-accuracy');
  });
});

describe('configuration changes recalculate immediately (FR-006)', () => {
  it('missing margin → plan unavailable; setting it produces a plan without waiting for a new fix', async () => {
    const p = new ManualProvider();
    const c = new MonitoringController({ provider: p, notifier: null, clock: () => NOW, config: baseConfig({ marginMinutes: null }) });
    c.start();
    p.emit({ type: 'position', position: fix() }); await flush();
    let s = c.snapshot as MonitoringSnapshot;
    expect(s.eta.status).toBe('available');
    expect(s.plan.status).toBe('unavailable');
    if (s.plan.status === 'unavailable') expect(s.plan.reason).toBe('margin-missing');
    s = await c.updateConfig(baseConfig({ marginMinutes: 10 }));
    expect(s.plan.status).toBe('available');
  });

  it('a longer duration moves the planned start earlier', async () => {
    const p = new ManualProvider();
    const c = new MonitoringController({ provider: p, notifier: null, clock: () => NOW, config: baseConfig({ durationMinutes: 20 }) });
    c.start();
    p.emit({ type: 'position', position: fix() }); await flush();
    const a = c.snapshot as MonitoringSnapshot;
    const b = await c.updateConfig(baseConfig({ durationMinutes: 60 }));
    if (a.plan.status !== 'available' || b.plan.status !== 'available') throw new Error('plans expected');
    expect(a.plan.minutesUntilPlannedStart - b.plan.minutesUntilPlannedStart).toBeCloseTo(40, 6);
  });
});

describe('alert delivery honesty', () => {
  // duration 250 + margin 10 = 260 min lead; fix at lon −1 → m = 300.2025 − 260 = 40.2 min: only the 60-min threshold is reached.
  const nearConfig = (): MonitoringConfig => baseConfig({ durationMinutes: 250, marginMinutes: 10 });

  it('raises the 60-min alert once even when evaluated repeatedly', async () => {
    const p = new ManualProvider(); const n = new FakeNotifier();
    const c = new MonitoringController({ provider: p, notifier: n, clock: () => NOW, config: nearConfig() });
    c.start();
    p.emit({ type: 'position', position: fix() }); await flush();
    await c.tick(); await c.tick(); await c.tick();
    expect(n.shown).toHaveLength(1);
  });

  it('with notification permission denied the alert is still raised, in-app only, with the reason', async () => {
    const p = new ManualProvider(); const n = new FakeNotifier(); n.perm = 'denied';
    const c = new MonitoringController({ provider: p, notifier: n, clock: () => NOW, config: nearConfig() });
    const records: MonitoringSnapshot['newAlerts'][number][] = [];
    c.subscribe((s) => records.push(...s.newAlerts));
    c.start();
    p.emit({ type: 'position', position: fix() }); await flush();
    expect(records).toHaveLength(1);
    expect(records[0]?.delivery).toBe('in-app-only');
    expect(records[0]?.deliveryNote).toMatch(/permission-not-granted/);
    expect(n.shown).toHaveLength(0);
  });

  it('with no notification provider the alert is in-app only, and is not repeated on later ticks', async () => {
    const p = new ManualProvider();
    const c = new MonitoringController({ provider: p, notifier: null, clock: () => NOW, config: nearConfig() });
    const records: MonitoringSnapshot['newAlerts'][number][] = [];
    c.subscribe((s) => records.push(...s.newAlerts));
    c.start();
    p.emit({ type: 'position', position: fix() }); await flush();
    await c.tick();
    expect(records).toHaveLength(1);
    expect(records[0]?.delivery).toBe('in-app-only');
    expect(records[0]?.deliveryNote).toMatch(/No notification provider/);
  });

  it('shortening the lead beyond the vessel position raises the overdue alert once, then nothing', async () => {
    const p = new ManualProvider(); const n = new FakeNotifier();
    const c = new MonitoringController({ provider: p, notifier: n, clock: () => NOW, config: baseConfig() });
    c.start();
    p.emit({ type: 'position', position: fix() }); await flush();
    const s1 = await c.updateConfig(baseConfig({ durationMinutes: 400 })); // lead 410 min > 300 min to crossing
    expect(s1.plan.status).toBe('unavailable');
    expect(s1.newAlerts.map((a) => a.alert.kind)).toEqual(['start-overdue']);
    const s2 = await c.tick();
    expect(s2.newAlerts).toHaveLength(0);
  });
});

describe('lifecycle', () => {
  it('start twice starts the provider once; stop stops it; stop without start is a no-op', () => {
    const p = new ManualProvider();
    const c = new MonitoringController({ provider: p, notifier: null, clock: () => NOW, config: baseConfig() });
    c.stop();
    expect(p.stops).toBe(0);
    c.start(); c.start();
    expect(p.starts).toBe(1);
    c.stop();
    expect(p.stops).toBe(1);
  });
  it('unsubscribe stops further snapshots', async () => {
    const p = new ManualProvider();
    const c = new MonitoringController({ provider: p, notifier: null, clock: () => NOW, config: baseConfig() });
    let n = 0;
    const off = c.subscribe(() => { n += 1; });
    c.start();
    p.emit({ type: 'position', position: fix() }); await flush();
    off();
    p.emit({ type: 'position', position: fix() }); await flush();
    expect(n).toBe(1);
  });
});

describe('skipped alert thresholds survive the session and reset on restart (5C-3, R-030)', () => {
  // m = 300.2025 − (duration + margin). duration 270 + margin 10 → m ≈ 20.2 min: 60 and 30 reached together → 30 alerted, 60 skipped.
  const lateConfig = (): MonitoringConfig => baseConfig({ durationMinutes: 270, marginMinutes: 10 });

  it('first sight: 60-min skipped as already passed, with a reason; persists across ticks without duplicating', async () => {
    const p = new ManualProvider(); const n = new FakeNotifier();
    const c = new MonitoringController({ provider: p, notifier: n, clock: () => NOW, config: lateConfig() });
    c.start();
    p.emit({ type: 'position', position: fix() }); await flush();
    let s = c.snapshot as MonitoringSnapshot;
    expect(s.skippedThresholds.map((t) => [t.thresholdMinutes, t.reason, t.alertedInsteadMinutes])).toEqual([[60, 'already-passed-at-start', 30]]);
    expect(s.skippedThresholds[0]?.recordedAtUtc).toBe(NOW);
    expect(n.shown).toHaveLength(1); // only the 30-min alert
    await c.tick(); await c.tick(); s = await c.tick();
    expect(s.skippedThresholds).toHaveLength(1);
  });

  it('none skipped on a normal approach', async () => {
    const p = new ManualProvider();
    const c = new MonitoringController({ provider: p, notifier: null, clock: () => NOW, config: baseConfig({ durationMinutes: 250, marginMinutes: 10 }) }); // m ≈ 40 → only 60 reached
    c.start();
    p.emit({ type: 'position', position: fix() }); await flush();
    expect((c.snapshot as MonitoringSnapshot).skippedThresholds).toEqual([]);
  });

  it('superseded-by-closer: a later jump past two thresholds records the older ones and keeps the first-sight record', async () => {
    const p = new ManualProvider();
    const c = new MonitoringController({ provider: p, notifier: null, clock: () => NOW, config: baseConfig({ durationMinutes: 20, marginMinutes: 10 }) }); // m ≈ 270: nothing reached
    c.start();
    p.emit({ type: 'position', position: fix() }); await flush();
    expect((c.snapshot as MonitoringSnapshot).skippedThresholds).toEqual([]);
    const s = await c.updateConfig(lateConfig()); // m drops to ≈ 20 in one evaluation → 60 and 30 reached together
    expect(s.skippedThresholds.map((t) => [t.thresholdMinutes, t.reason, t.alertedInsteadMinutes])).toEqual([[60, 'superseded-by-closer', 30]]);
  });

  it('the list accumulates for the session: a second skip is added after the first, never replacing it', async () => {
    const p = new ManualProvider();
    const c = new MonitoringController({ provider: p, notifier: null, clock: () => NOW, config: lateConfig() });
    c.start();
    p.emit({ type: 'position', position: fix() }); await flush(); // first sight at ≈20 min → 60 skipped (already passed)
    await c.updateConfig(baseConfig({ durationMinutes: 20, marginMinutes: 10 })); // m ≈ 270: both thresholds re-arm (> T + 2 min)
    const s = await c.updateConfig(lateConfig()); // back to ≈20 min in one step → 60 skipped again, now superseded
    expect(s.skippedThresholds.map((t) => [t.thresholdMinutes, t.reason])).toEqual([
      [60, 'already-passed-at-start'], [60, 'superseded-by-closer'],
    ]);
  });

  it('a restarted controller (page reload / update reload) starts with an empty list', async () => {
    const p1 = new ManualProvider();
    const c1 = new MonitoringController({ provider: p1, notifier: null, clock: () => NOW, config: lateConfig() });
    c1.start(); p1.emit({ type: 'position', position: fix() }); await flush();
    expect((c1.snapshot as MonitoringSnapshot).skippedThresholds).toHaveLength(1);
    c1.stop();

    const p2 = new ManualProvider();
    const c2 = new MonitoringController({ provider: p2, notifier: null, clock: () => NOW, config: lateConfig() });
    expect(c2.snapshot).toBeNull();
    c2.start(); p2.emit({ type: 'error', kind: 'timeout', message: 'no fix yet' }); await flush();
    expect((c2.snapshot as MonitoringSnapshot).skippedThresholds).toEqual([]); // nothing carried over from c1
  });
});
