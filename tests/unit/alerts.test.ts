// FR-008: alert scheduling (pure). Thresholds, duplicate suppression, first-sight skipping, re-arm hysteresis, overdue, honesty wording.
import { describe, it, expect } from 'vitest';
import {
  describeSkippedThreshold, evaluateAlerts, INITIAL_ALERT_STATE, normalizeThresholds, REARM_MARGIN_MINUTES, DEFAULT_ALERT_THRESHOLDS_MINUTES,
  type AlertState, type ChangeoverPlanAvailable, type ChangeoverPlanResult,
} from '../../src/domain';
import { NOW } from '../fixtures';

const T = DEFAULT_ALERT_THRESHOLDS_MINUTES; // 60, 30, 15, 5

function plan(minutes: number, labels: string[] = []): ChangeoverPlanAvailable {
  return {
    status: 'available', plannedStartAtUtc: '2026-10-12T08:00:00.000Z', predictedCrossingAtUtc: '2026-10-12T08:30:00.000Z',
    durationMinutes: 20, marginMinutes: 10, durationMethod: 'manual-verified', durationLabel: 'x',
    plannedStartDistanceBeforeCrossingNm: 6, plannedStartRouteDistanceNm: 100, plannedStartPointLonLatDeg: [0, 0],
    minutesUntilPlannedStart: minutes, assumptions: [], warnings: [], labels,
  };
}
const overdue: ChangeoverPlanResult = {
  status: 'unavailable', reason: 'start-overdue', explanation: 'passed',
  details: { plannedStartAtUtc: '2026-10-12T05:50:00.000Z', overdueByMinutes: 10 },
};
const missingMargin: ChangeoverPlanResult = { status: 'unavailable', reason: 'margin-missing', explanation: 'set a margin' };

/** Feed a countdown sequence through the scheduler; returns the thresholds alerted, in order. */
function run(minutesSeq: number[], start: AlertState = INITIAL_ALERT_STATE): { fired: (number | null)[]; state: AlertState } {
  let state = start;
  const fired: (number | null)[] = [];
  for (const m of minutesSeq) {
    const r = evaluateAlerts(plan(m), T, state, NOW);
    state = r.state;
    for (const d of r.due) fired.push(d.thresholdMinutes);
  }
  return { fired, state };
}

describe('normalizeThresholds', () => {
  it('drops non-positive / non-finite values, de-duplicates and sorts descending', () => {
    expect(normalizeThresholds([5, 60, 30, 30, -1, Number.NaN, 0, Number.POSITIVE_INFINITY])).toEqual([60, 30, 5]);
  });
});

describe('threshold alerts', () => {
  it('raises nothing above the largest threshold', () => {
    expect(run([300, 120, 60.5]).fired).toEqual([]);
  });
  it('raises each threshold exactly once as the countdown falls (duplicate suppression)', () => {
    const seq = [] as number[];
    for (let m = 90; m >= 0; m -= 0.5) seq.push(m);
    expect(run(seq).fired).toEqual([60, 30, 15, 5]);
  });
  it('re-evaluating at the same minute does not repeat an alert', () => {
    expect(run([59, 59, 59, 58.9]).fired).toEqual([60]);
  });
  it('raises only the CLOSEST threshold when several are already passed on first sight, and reports the rest as skipped', () => {
    const r = evaluateAlerts(plan(20), T, INITIAL_ALERT_STATE, NOW);
    expect(r.due.map((d) => d.thresholdMinutes)).toEqual([30]);
    expect(r.skipped).toEqual([60]);
    expect(r.state.firedThresholds).toEqual([60, 30]);
    const r2 = evaluateAlerts(plan(3), T, INITIAL_ALERT_STATE, NOW);
    expect(r2.due.map((d) => d.thresholdMinutes)).toEqual([5]);
    expect(r2.skipped).toEqual([60, 30, 15]);
  });
  it('does not re-trigger on small upward jitter inside the re-arm margin', () => {
    // 29 raises the 30-min alert (60 is skipped as already passed); 31 is within 30 + margin → no re-arm; back to 29 → silent.
    expect(run([29, 29 + REARM_MARGIN_MINUTES, 29]).fired).toEqual([30]);
  });
  it('re-arms a threshold when the plan moves clearly later, then alerts again on the next approach', () => {
    // 29 → fires 60 and (closest only) 30; moving out to 40 re-arms 30 (40 > 30 + margin); falling back to 29 fires 30 again.
    const { fired } = run([29, 40, 29]);
    expect(fired).toEqual([30, 30]);
  });
  it('is silent when the plan is unavailable and leaves the state unchanged', () => {
    const s: AlertState = { firedThresholds: [60], overdueFired: false };
    const r = evaluateAlerts(missingMargin, T, s, NOW);
    expect(r.due).toEqual([]);
    expect(r.state).toEqual(s);
  });
  it('ignores an invalid current time', () => {
    expect(evaluateAlerts(plan(10), T, INITIAL_ALERT_STATE, 'not-a-time').due).toEqual([]);
  });
  it('with no usable thresholds raises nothing', () => {
    expect(evaluateAlerts(plan(1), [0, -5], INITIAL_ALERT_STATE, NOW).due).toEqual([]);
  });
});

describe('start-overdue alert', () => {
  it('is raised once, not on every update', () => {
    let state = INITIAL_ALERT_STATE;
    const kinds: string[] = [];
    for (let i = 0; i < 4; i++) {
      const r = evaluateAlerts(overdue, T, state, NOW);
      state = r.state;
      kinds.push(...r.due.map((d) => d.kind));
    }
    expect(kinds).toEqual(['start-overdue']);
  });
  it('is not raised when overdue details are absent', () => {
    expect(evaluateAlerts({ status: 'unavailable', reason: 'start-overdue', explanation: 'x' }, T, INITIAL_ALERT_STATE, NOW).due).toEqual([]);
  });
  it('re-arms after a valid plan returns', () => {
    let state = evaluateAlerts(overdue, T, INITIAL_ALERT_STATE, NOW).state;
    expect(state.overdueFired).toBe(true);
    state = evaluateAlerts(plan(500), T, state, NOW).state;
    expect(state.overdueFired).toBe(false);
    expect(evaluateAlerts(overdue, T, state, NOW).due.length).toBe(1);
  });
});

describe('alert wording (honesty)', () => {
  it('carries SIMULATED / DEMO labels so a notification is never mistaken for real', () => {
    const r = evaluateAlerts(plan(10, ['SIMULATED', 'DEMO DATA — NOT FOR NAVIGATION OR REGULATORY COMPLIANCE']), T, INITIAL_ALERT_STATE, NOW);
    const msg = r.due[0]?.message ?? '';
    expect(msg).toMatch(/^\[SIMULATED · DEMO DATA/);
    expect(msg).toMatch(/Advisory only/);
  });
  it('never claims compliance and states minutes honestly', () => {
    const msg = evaluateAlerts(plan(4.4), T, INITIAL_ALERT_STATE, NOW).due[0]?.message ?? '';
    expect(msg).not.toMatch(/complian|certif|approved/i);
    expect(msg).toMatch(/about 4 min/);
  });
  it('gives equal alerts a stable id and different thresholds different ids', () => {
    const a = evaluateAlerts(plan(29), T, INITIAL_ALERT_STATE, NOW).due[0]?.id;
    const b = evaluateAlerts(plan(29), T, INITIAL_ALERT_STATE, NOW).due[0]?.id;
    const c = evaluateAlerts(plan(14), T, INITIAL_ALERT_STATE, NOW).due[0]?.id;
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe('skipped thresholds carry a reason (5C-3; the scheduler decides, nothing is re-derived elsewhere)', () => {
  it('first sight at 20 min: 60 is skipped as already-passed-at-start, 30 is alerted instead', () => {
    const r = evaluateAlerts(plan(20), T, INITIAL_ALERT_STATE, NOW);
    expect(r.skipped).toEqual([60]);
    expect(r.skippedDetail).toEqual([{ thresholdMinutes: 60, reason: 'already-passed-at-start', alertedInsteadMinutes: 30 }]);
  });
  it('first sight at 3 min: 60, 30, 15 all already-passed-at-start, 5 alerted', () => {
    const r = evaluateAlerts(plan(3), T, INITIAL_ALERT_STATE, NOW);
    expect(r.skippedDetail.map((d) => [d.thresholdMinutes, d.reason, d.alertedInsteadMinutes])).toEqual([
      [60, 'already-passed-at-start', 5], [30, 'already-passed-at-start', 5], [15, 'already-passed-at-start', 5],
    ]);
  });
  it('a later jump past two thresholds at once is superseded-by-closer, not already-passed', () => {
    const first = evaluateAlerts(plan(200), T, INITIAL_ALERT_STATE, NOW);
    expect(first.state.planSeen).toBe(true);
    const r = evaluateAlerts(plan(10), T, first.state, NOW); // 60, 30, 15 reached together; 15 is closest; 5 not yet
    expect(r.due.map((d) => d.thresholdMinutes)).toEqual([15]);
    expect(r.skippedDetail.map((d) => [d.thresholdMinutes, d.reason, d.alertedInsteadMinutes])).toEqual([
      [60, 'superseded-by-closer', 15], [30, 'superseded-by-closer', 15],
    ]);
  });
  it('nothing skipped on a normal countdown (one threshold at a time)', () => {
    let state = INITIAL_ALERT_STATE;
    const all: number[] = [];
    for (let m = 90; m >= 0; m -= 0.5) { const r = evaluateAlerts(plan(m), T, state, NOW); state = r.state; all.push(...r.skipped); expect(r.skippedDetail).toEqual([]); }
    expect(all).toEqual([]);
  });
  it('skippedDetail lists exactly the same thresholds as skipped, in the same order', () => {
    const r = evaluateAlerts(plan(3), T, INITIAL_ALERT_STATE, NOW);
    expect(r.skippedDetail.map((d) => d.thresholdMinutes)).toEqual([...r.skipped]);
  });
  it('an unavailable plan or invalid time skips nothing and does not mark a plan as seen', () => {
    expect(evaluateAlerts(missingMargin, T, INITIAL_ALERT_STATE, NOW).skippedDetail).toEqual([]);
    expect(evaluateAlerts(missingMargin, T, INITIAL_ALERT_STATE, NOW).state.planSeen).toBe(false);
    expect(evaluateAlerts(plan(3), T, INITIAL_ALERT_STATE, 'bad').skippedDetail).toEqual([]);
  });
  it('a state without planSeen (older shape) is treated as first sight', () => {
    const legacy: AlertState = { firedThresholds: [], overdueFired: false };
    expect(evaluateAlerts(plan(20), T, legacy, NOW).skippedDetail[0]?.reason).toBe('already-passed-at-start');
  });
  it('wording names the threshold, the reason and the alert that was raised; no compliance claims', () => {
    const a = describeSkippedThreshold({ thresholdMinutes: 60, reason: 'already-passed-at-start', alertedInsteadMinutes: 30 });
    expect(a).toMatch(/^60-min alert skipped: already passed/);
    expect(a).toMatch(/30-min alert was raised instead/);
    const b = describeSkippedThreshold({ thresholdMinutes: 30, reason: 'superseded-by-closer', alertedInsteadMinutes: 15 });
    expect(b).toMatch(/^30-min alert skipped: passed together with the closer 15-min/);
    expect(a + b).not.toMatch(/complian|certif|approved/i);
  });
});
