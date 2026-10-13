// FR-009/FR-012 use cases with fake store, injected clock and id generator. SYNTHETIC/SIMULATED data only.
import { describe, it, expect } from 'vitest';
import { INITIAL_ALERT_STATE, parseIsoUtc, type ChangeoverLogEntry } from '../../src/domain';
import type { LogLoadResult, LogStore } from '../../src/application/ports';
import { defaultMonitoringConfig, evaluateMonitoring, type MonitoringSnapshot } from '../../src/application/use-cases/monitoring';
import { buildLogDraft, ChangeoverLogService, currentPositionLonLat } from '../../src/application/use-cases/changeoverLog';
import { dataset, EQ_ROUTE, NOW, position } from '../fixtures';

function snapshot(over: { duration: number | null; margin: number | null; fix: ReturnType<typeof position> | null }): MonitoringSnapshot {
  const config = defaultMonitoringConfig({ route: EQ_ROUTE, dataset: dataset(), durationMinutes: over.duration, marginMinutes: over.margin });
  const r = evaluateMonitoring({ fix: over.fix, config, nowUtc: NOW, alertState: INITIAL_ALERT_STATE, progressAlongRouteNm: null });
  return { nowUtc: NOW, badge: 'SIMULATED', position: r.position, lastFix: over.fix, providerError: null, eta: r.eta, plan: r.plan, newAlerts: [], skippedThresholds: [] };
}

class MemoryStore implements LogStore {
  rows = new Map<string, ChangeoverLogEntry>();
  rejected = 0; failPut = false; failLoad = false;
  async loadAll(): Promise<LogLoadResult> {
    if (this.failLoad) throw new Error('db unavailable');
    return { entries: [...this.rows.values()].sort((a, b) => (a.createdAtUtc < b.createdAtUtc ? 1 : -1)), rejectedCount: this.rejected };
  }
  async put(e: ChangeoverLogEntry): Promise<void> { if (this.failPut) throw new Error('quota exceeded'); this.rows.set(e.id, JSON.parse(JSON.stringify(e))); }
}
function service(store = new MemoryStore(), startMs = parseIsoUtc(NOW) as number) {
  let t = startMs; let n = 0;
  const svc = new ChangeoverLogService({ store, clock: () => { const iso = new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z'); t += 60_000; return iso; }, newId: () => `id-${++n}` });
  return { svc, store };
}

describe('buildLogDraft (hand-derived: vessel at lon -1 on EQ_ROUTE, square entry at lon 0, 12 kn)', () => {
  // Remaining 1° = 60.0405 nm → 5.00338 h = 300.2 min to crossing; lead = 20 + 10 = 30 min.
  it('snapshots an available plan with the duration source label', () => {
    const d = buildLogDraft(snapshot({ duration: 20, margin: 10, fix: position() }), dataset(), 'simulator');
    expect(d.positionSource).toBe('simulator');
    expect(d.plan.durationMinutes).toBe(20);
    expect(d.plan.marginMinutes).toBe(10);
    expect(d.plan.durationMethod).toBe('manual-verified');
    expect(d.plan.durationLabel).toContain('NOT a FOBAS result');
    const start = parseIsoUtc(d.plan.plannedStartAtUtc);
    const crossing = parseIsoUtc(d.plan.predictedCrossingAtUtc);
    expect(start).not.toBeNull();
    expect((crossing as number) - (start as number)).toBe(30 * 60_000);
    expect(d.dataset).toEqual({ name: 'TEST SQUARE (synthetic)', version: '0.0.0', verificationStatus: 'synthetic' });
  });
  it('keeps the overdue planned start but never invents a crossing or duration source', () => {
    const d = buildLogDraft(snapshot({ duration: 300, margin: 10, fix: position() }), dataset(), 'simulator');
    expect(d.plan.plannedStartAtUtc).not.toBeNull();
    expect(d.plan.predictedCrossingAtUtc).toBeNull();
    expect(d.plan.durationMinutes).toBeNull();
  });
  it('with no fix: GPS mode reports source unavailable and every plan field null', () => {
    const d = buildLogDraft(snapshot({ duration: 20, margin: 10, fix: null }), dataset(), 'gps');
    expect(d.positionSource).toBe('unavailable');
    expect(Object.values(d.plan).every((v) => v === null)).toBe(true);
  });
  it('GPS mode with a valid fix is browser-gps; null snapshot and dataset are tolerated', () => {
    expect(buildLogDraft(snapshot({ duration: 20, margin: 10, fix: position({ isSimulated: false, source: 'browser-gps' }) }), dataset(), 'gps').positionSource).toBe('browser-gps');
    const d = buildLogDraft(null, null, 'gps');
    expect(d.dataset).toBeNull();
    expect(d.positionSource).toBe('unavailable');
  });
  it('currentPositionLonLat returns [lon, lat] for a valid fix and null otherwise', () => {
    expect(currentPositionLonLat(snapshot({ duration: 20, margin: 10, fix: position() }))).toEqual([-1, 0]);
    expect(currentPositionLonLat(snapshot({ duration: 20, margin: 10, fix: null }))).toBeNull();
    expect(currentPositionLonLat(null)).toBeNull();
  });
});

describe('ChangeoverLogService', () => {
  const draft = () => buildLogDraft(snapshot({ duration: 20, margin: 10, fix: position() }), dataset(), 'simulator');

  it('creates with injected id and clock, persists, and starts with nothing confirmed', async () => {
    const { svc, store } = service();
    const r = await svc.create(draft());
    expect(r.ok && r.savedOnDevice).toBe(true);
    if (!r.ok) return;
    expect(r.entry.id).toBe('id-1');
    expect(r.entry.createdAtUtc).toBe(NOW);
    expect(r.entry.actualStart).toBeNull();
    expect(r.entry.isSimulated).toBe(true);
    expect(store.rows.has('id-1')).toBe(true);
  });
  it('persists confirmations and a fresh service sees them after reload', async () => {
    const { svc, store } = service();
    await svc.create(draft());
    await svc.confirmStart('id-1', '2026-10-12T05:50:00Z', [-1, 0]);
    await svc.confirmCompletion('id-1', '2026-10-12T05:55:00Z', null);
    const { svc: reloaded } = service(store);
    const status = await reloaded.load();
    expect(status).toEqual({ rejectedCount: 0, loadError: null });
    const e = reloaded.list()[0] as ChangeoverLogEntry;
    expect(e.actualStart?.eventAtUtc).toBe('2026-10-12T05:50:00Z');
    expect(e.actualCompletion?.eventAtUtc).toBe('2026-10-12T05:55:00Z');
    expect(e.actualStart?.positionLonLatDeg).toEqual([-1, 0]);
  });
  it('reports a failed save honestly but keeps the change in memory', async () => {
    const store = new MemoryStore(); store.failPut = true;
    const { svc } = service(store);
    const r = await svc.create(draft());
    expect(r.ok && !r.savedOnDevice).toBe(true);
    expect(r.ok ? r.saveError : '').toContain('quota exceeded');
    expect(svc.list()).toHaveLength(1);
  });
  it('passes domain validation errors through and does not persist them', async () => {
    const { svc, store } = service();
    await svc.create(draft());
    const r = await svc.confirmStart('id-1', '2027-01-01T00:00:00Z', null);
    expect(r.ok).toBe(false);
    expect(r.ok ? '' : r.reason).toBe('future-timestamp');
    expect((store.rows.get('id-1') as ChangeoverLogEntry).actualStart).toBeNull();
  });
  it('rejects unknown ids', async () => {
    const { svc } = service();
    const r = await svc.confirmStart('nope', NOW, null);
    expect(r.ok ? '' : r.reason).toBe('not-found');
  });
  it('acknowledges once per alert, requires a reason for overrides, saves notes', async () => {
    const { svc } = service();
    await svc.create(draft());
    await svc.acknowledge('id-1', 'a-30'); await svc.acknowledge('id-1', 'a-30');
    expect(svc.list()[0]?.acknowledgments).toHaveLength(1);
    const bad = await svc.override('id-1', { field: 'duration', newValue: 60, reason: '' });
    expect(bad.ok ? '' : bad.reason).toBe('reason-required');
    const good = await svc.override('id-1', { field: 'duration', newValue: 60, reason: 'Re-verified' });
    expect(good.ok && good.entry.overrides[0]?.previousValue === 20).toBe(true);
    await svc.saveNotes('id-1', 'Bridge informed');
    expect(svc.list()[0]?.notes).toBe('Bridge informed');
  });
  it('load reports unreadable storage and rejected record counts', async () => {
    const failing = new MemoryStore(); failing.failLoad = true;
    expect((await service(failing).svc.load()).loadError).toContain('db unavailable');
    const lossy = new MemoryStore(); lossy.rejected = 3;
    expect((await service(lossy).svc.load()).rejectedCount).toBe(3);
  });
  it('exports CSV with provenance, file name from the injected clock, and summary counts', async () => {
    const { svc } = service();
    await svc.create(draft());
    const out = svc.exportCsv();
    expect(out.entryCount).toBe(1);
    expect(out.csv).toContain('SIMULATED — not a real event');
    expect(out.fileName).toMatch(/^fuelswitch-changeover-log-20261012T0\d{5}Z\.csv$/);
    expect(out.summary).toContain('Entries: 1 (simulated: 1)');
  });
});
