// FR-009: human-confirmed changeover log (pure domain). All data is SYNTHETIC/SIMULATED test data.
import { describe, it, expect } from 'vitest';
import {
  acknowledgeAlert, actualDurationMinutes, applyOverride, confirmCompletion, confirmStart, createLogEntry,
  logEntryState, parseLogEntry, setNotes, type ChangeoverLogEntry, type CreateLogEntryInput,
} from '../../src/domain';

const NOW = '2026-10-12T06:00:00Z';
const PLAN = {
  plannedStartAtUtc: '2026-10-12T08:00:00Z', predictedCrossingAtUtc: '2026-10-12T09:00:00Z',
  plannedStartPointLonLatDeg: [-1.5, 0] as const, durationMinutes: 45, durationMethod: 'manual-verified' as const,
  durationLabel: 'Manually entered duration (user-verified; NOT a FOBAS result)', marginMinutes: 15,
};
const DATASET = { name: 'Synthetic test ECA', version: 'demo-0', verificationStatus: 'synthetic' as const };
const input = (over: Partial<CreateLogEntryInput> = {}): CreateLogEntryInput =>
  ({ id: 'e1', positionSource: 'simulator', dataset: DATASET, plan: PLAN, ...over });
function entry(over: Partial<CreateLogEntryInput> = {}): ChangeoverLogEntry {
  const r = createLogEntry(input(over), NOW);
  if (!r.ok) throw new Error(r.explanation);
  return r.entry;
}
function expectFail(r: ReturnType<typeof createLogEntry>, reason: string): void {
  expect(r.ok).toBe(false);
  expect(r.ok ? '' : r.reason).toBe(reason);
}
const must = (r: ReturnType<typeof createLogEntry>): ChangeoverLogEntry => { if (!r.ok) throw new Error(r.explanation); return r.entry; };

describe('createLogEntry', () => {
  it('creates a planned entry with nothing human-confirmed', () => {
    const e = entry();
    expect(logEntryState(e)).toBe('planned');
    expect(e.actualStart).toBeNull();
    expect(e.actualCompletion).toBeNull();
    expect(e.createdAtUtc).toBe(NOW);
  });
  it('flags simulator entries as simulated and GPS entries as not', () => {
    expect(entry().isSimulated).toBe(true);
    expect(entry({ positionSource: 'browser-gps' }).isSimulated).toBe(false);
  });
  it('rejects empty id, bad now, bad plan timestamp, bad point and negative duration', () => {
    expect(createLogEntry(input({ id: ' ' }), NOW).ok).toBe(false);
    expect(createLogEntry(input(), '2026-02-31T00:00:00Z').ok).toBe(false);
    expect(createLogEntry(input({ plan: { ...PLAN, plannedStartAtUtc: 'tomorrow' } }), NOW).ok).toBe(false);
    expect(createLogEntry(input({ plan: { ...PLAN, plannedStartPointLonLatDeg: [200, 0] } }), NOW).ok).toBe(false);
    expect(createLogEntry(input({ plan: { ...PLAN, durationMinutes: -1 } }), NOW).ok).toBe(false);
  });
  it('accepts a plan with nothing computed (ETA unavailable) without inventing values', () => {
    const e = entry({ plan: { ...PLAN, plannedStartAtUtc: null, predictedCrossingAtUtc: null, plannedStartPointLonLatDeg: null, durationMinutes: null, durationMethod: null, durationLabel: null, marginMinutes: null } });
    expect(e.plan.plannedStartAtUtc).toBeNull();
  });
});

describe('confirmStart / confirmCompletion (human only)', () => {
  it('records the human-stated time and the confirmation time separately', () => {
    const r = confirmStart(entry(), { eventAtUtc: '2026-10-12T05:50:00Z', positionLonLatDeg: [-1.4, 0.01] }, NOW);
    if (!r.ok) throw new Error(r.explanation);
    expect(r.entry.actualStart?.eventAtUtc).toBe('2026-10-12T05:50:00Z');
    expect(r.entry.actualStart?.confirmedAtUtc).toBe(NOW);
    expect(logEntryState(r.entry)).toBe('started');
  });
  it('does not mutate the original entry', () => {
    const e = entry();
    confirmStart(e, { eventAtUtc: NOW, positionLonLatDeg: null }, NOW);
    expect(e.actualStart).toBeNull();
  });
  it('allows a null position (no fix) and never fabricates one', () => {
    const r = confirmStart(entry(), { eventAtUtc: NOW, positionLonLatDeg: null }, NOW);
    expect(r.ok && r.entry.actualStart?.positionLonLatDeg === null).toBe(true);
  });
  it('rejects invalid timestamps, invalid positions and future times beyond skew', () => {
    const e = entry();
    expectFail(confirmStart(e, { eventAtUtc: 'now', positionLonLatDeg: null }, NOW), 'invalid-timestamp');
    expectFail(confirmStart(e, { eventAtUtc: NOW, positionLonLatDeg: [999, 0] }, NOW), 'invalid-position');
    expectFail(confirmStart(e, { eventAtUtc: '2026-10-12T06:05:00Z', positionLonLatDeg: null }, NOW), 'future-timestamp');
  });
  it('tolerates 2 minutes of clock skew but not 3', () => {
    expect(confirmStart(entry(), { eventAtUtc: '2026-10-12T06:02:00Z', positionLonLatDeg: null }, NOW).ok).toBe(true);
    expect(confirmStart(entry(), { eventAtUtc: '2026-10-12T06:03:00Z', positionLonLatDeg: null }, NOW).ok).toBe(false);
  });
  it('refuses a second start confirmation (must use override)', () => {
    const s = must(confirmStart(entry(), { eventAtUtc: NOW, positionLonLatDeg: null }, NOW));
    expectFail(confirmStart(s, { eventAtUtc: NOW, positionLonLatDeg: null }, NOW), 'already-confirmed');
  });
  it('requires a start before completion, and completion not before start', () => {
    expectFail(confirmCompletion(entry(), { eventAtUtc: NOW, positionLonLatDeg: null }, NOW), 'start-missing');
    const s = must(confirmStart(entry(), { eventAtUtc: '2026-10-12T05:00:00Z', positionLonLatDeg: null }, NOW));
    expectFail(confirmCompletion(s, { eventAtUtc: '2026-10-12T04:59:00Z', positionLonLatDeg: null }, NOW), 'completion-before-start');
  });
  it('actual duration is derived only from the two human times: 05:00 → 05:48 = 48 min', () => {
    const s = must(confirmStart(entry(), { eventAtUtc: '2026-10-12T05:00:00Z', positionLonLatDeg: null }, NOW));
    expect(actualDurationMinutes(s)).toBeNull();
    const c = must(confirmCompletion(s, { eventAtUtc: '2026-10-12T05:48:00Z', positionLonLatDeg: null }, NOW));
    expect(actualDurationMinutes(c)).toBe(48);
    expect(logEntryState(c)).toBe('completed');
  });
});

describe('acknowledgments', () => {
  it('records once per alert id (idempotent)', () => {
    let e = entry();
    e = must(acknowledgeAlert(e, 'a-30', NOW));
    e = must(acknowledgeAlert(e, 'a-30', '2026-10-12T06:01:00Z'));
    e = must(acknowledgeAlert(e, 'a-15', NOW));
    expect(e.acknowledgments).toHaveLength(2);
    expect(e.acknowledgments[0]?.acknowledgedAtUtc).toBe(NOW);
  });
  it('rejects an empty alert id', () => { expect(acknowledgeAlert(entry(), '', NOW).ok).toBe(false); });
});

describe('applyOverride keeps history and demands a reason', () => {
  const started = (): ChangeoverLogEntry => must(confirmStart(entry(), { eventAtUtc: '2026-10-12T05:00:00Z', positionLonLatDeg: null }, NOW));
  it('requires a non-blank reason', () => {
    expectFail(applyOverride(started(), { field: 'actualStart', newValue: '2026-10-12T04:55:00Z', reason: '  ' }, NOW), 'reason-required');
  });
  it('corrects the start, recording previous value, new value and reason', () => {
    const r = must(applyOverride(started(), { field: 'actualStart', newValue: '2026-10-12T04:55:00Z', reason: 'Logbook shows 04:55' }, NOW));
    expect(r.actualStart?.eventAtUtc).toBe('2026-10-12T04:55:00Z');
    expect(r.overrides[0]).toEqual({ field: 'actualStart', previousValue: '2026-10-12T05:00:00Z', newValue: '2026-10-12T04:55:00Z', reason: 'Logbook shows 04:55', recordedAtUtc: NOW });
  });
  it('refuses to override something that was never recorded', () => {
    expectFail(applyOverride(entry(), { field: 'actualStart', newValue: NOW, reason: 'x' }, NOW), 'nothing-to-override');
  });
  it('refuses a start later than the recorded completion and a completion earlier than start', () => {
    const s = started();
    const c = must(confirmCompletion(s, { eventAtUtc: '2026-10-12T05:40:00Z', positionLonLatDeg: null }, NOW));
    expectFail(applyOverride(c, { field: 'actualStart', newValue: '2026-10-12T05:50:00Z', reason: 'x' }, NOW), 'completion-before-start');
    expectFail(applyOverride(c, { field: 'actualCompletion', newValue: '2026-10-12T04:00:00Z', reason: 'x' }, NOW), 'completion-before-start');
  });
  it('overrides duration/margin with previous value kept, and rejects negatives', () => {
    const r = must(applyOverride(entry(), { field: 'duration', newValue: 60, reason: 'Chief engineer re-verified' }, NOW));
    expect(r.plan.durationMinutes).toBe(60);
    expect(r.overrides[0]?.previousValue).toBe(45);
    expectFail(applyOverride(entry(), { field: 'margin', newValue: -5, reason: 'x' }, NOW), 'invalid-value');
  });
  it('can override a previously null duration (previousValue stays null, not invented)', () => {
    const e = entry({ plan: { ...PLAN, durationMinutes: null } });
    const r = must(applyOverride(e, { field: 'duration', newValue: 30, reason: 'entered late' }, NOW));
    expect(r.overrides[0]?.previousValue).toBeNull();
  });
});

describe('parseLogEntry (storage read-back)', () => {
  it('round-trips through JSON', () => {
    const e = must(confirmStart(entry(), { eventAtUtc: NOW, positionLonLatDeg: [-1.4, 0.01] }, NOW));
    expect(parseLogEntry(JSON.parse(JSON.stringify(e)))).toEqual(e);
  });
  it('rejects junk, wrong version, inconsistent simulated flag and bad event times', () => {
    const e = entry();
    expect(parseLogEntry(null)).toBeNull();
    expect(parseLogEntry({})).toBeNull();
    expect(parseLogEntry({ ...e, schemaVersion: 99 })).toBeNull();
    expect(parseLogEntry({ ...e, isSimulated: false })).toBeNull();
    expect(parseLogEntry({ ...e, actualStart: { eventAtUtc: 'x', confirmedAtUtc: NOW, positionLonLatDeg: null } })).toBeNull();
  });
  it('setNotes changes only notes', () => {
    const e = entry();
    expect(setNotes(e, 'Bridge informed').notes).toBe('Bridge informed');
    expect(e.notes).toBe('');
  });
});
