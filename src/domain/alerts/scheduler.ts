// Alert scheduler (pure). FR-008 / KOS 05. Decides WHICH alerts are due; delivering them is an adapter concern.
// Thresholds are lead times before the PLANNED CHANGEOVER START (minutes). PROPOSED defaults, user-configurable, not regulatory.
import { parseIsoUtc } from '../units';
import type { ChangeoverPlanResult } from '../changeover/planner';
import type { SkippedThreshold } from './skipped';

export type AlertKind = 'threshold' | 'start-overdue';

export interface AlertDue {
  /** Stable id: same alert → same id (usable as a notification `tag`). */
  readonly id: string;
  readonly kind: AlertKind;
  readonly thresholdMinutes: number | null;
  readonly minutesUntilPlannedStart: number | null;
  readonly plannedStartAtUtc: string;
  /** Plain advisory wording; includes SIMULATED/DEMO labels so a lock-screen notification is never mistaken for real. */
  readonly message: string;
  readonly labels: readonly string[];
}

export interface AlertState {
  /** Thresholds already alerted (or deliberately skipped because they had already passed on first sight). */
  readonly firedThresholds: readonly number[];
  readonly overdueFired: boolean;
  /** True once a usable plan has been evaluated in this session. Absent = false. Lets the scheduler tell "already passed at start" from "superseded". */
  readonly planSeen?: boolean;
}

export const INITIAL_ALERT_STATE: AlertState = { firedThresholds: [], overdueFired: false, planSeen: false };

/** A fired threshold re-arms only once the countdown rises this far ABOVE it (plan moved later), so SOG jitter cannot re-trigger it. */
export const REARM_MARGIN_MINUTES = 2;

export interface AlertEvaluation {
  readonly due: readonly AlertDue[];
  readonly state: AlertState;
  /** Thresholds that were already past when first seen and are therefore NOT alerted (stale 60/30 min alerts are noise). */
  readonly skipped: readonly number[];
  /** Same thresholds as `skipped`, with the scheduler's reason for each (5C-3). */
  readonly skippedDetail: readonly SkippedThreshold[];
}

/** Keep finite thresholds > 0, de-duplicate, sort descending. */
export function normalizeThresholds(thresholds: readonly number[]): number[] {
  return [...new Set(thresholds.filter((t) => Number.isFinite(t) && t > 0))].sort((a, b) => b - a);
}

function labelPrefix(labels: readonly string[]): string {
  return labels.length > 0 ? `[${labels.join(' · ')}] ` : '';
}

export function evaluateAlerts(
  plan: ChangeoverPlanResult,
  thresholdsMinutes: readonly number[],
  state: AlertState,
  nowUtc: string,
): AlertEvaluation {
  const thresholds = normalizeThresholds(thresholdsMinutes);

  if (plan.status === 'unavailable') {
    // The one unavailable plan that IS an alert: planned start already passed. Fired once; re-armed when a plan is available again.
    if (plan.reason === 'start-overdue' && plan.details && !state.overdueFired) {
      const due: AlertDue = {
        id: `overdue:${plan.details.plannedStartAtUtc}`,
        kind: 'start-overdue',
        thresholdMinutes: null,
        minutesUntilPlannedStart: -plan.details.overdueByMinutes,
        plannedStartAtUtc: plan.details.plannedStartAtUtc,
        message: `Planned changeover start time has passed (${Math.round(plan.details.overdueByMinutes)} min ago). Advisory only — follow the vessel's procedure.`,
        labels: [],
      };
      return { due: [due], state: { ...state, overdueFired: true }, skipped: [], skippedDetail: [] };
    }
    return { due: [], state, skipped: [], skippedDetail: [] };
  }

  if (parseIsoUtc(nowUtc) === null) return { due: [], state, skipped: [], skippedDetail: [] };

  const m = plan.minutesUntilPlannedStart;
  // Re-arm: forget fired thresholds that the countdown has risen clearly above.
  const stillFired = state.firedThresholds.filter((t) => m <= t + REARM_MARGIN_MINUTES);
  const newlyReached = thresholds.filter((t) => m <= t && !stillFired.includes(t));

  const due: AlertDue[] = [];
  const skipped: number[] = [];
  const skippedDetail: SkippedThreshold[] = [];
  if (newlyReached.length > 0) {
    // Several thresholds passed at once (first plan, or a long gap): alert only for the closest one, skip the rest.
    const closest = Math.min(...newlyReached);
    skipped.push(...newlyReached.filter((t) => t !== closest));
    const reason = state.planSeen ? 'superseded-by-closer' : 'already-passed-at-start';
    skippedDetail.push(...skipped.map((t) => ({ thresholdMinutes: t, reason, alertedInsteadMinutes: closest }) as const));
    due.push({
      id: `threshold:${closest}:${plan.plannedStartAtUtc.slice(0, 16)}`,
      kind: 'threshold',
      thresholdMinutes: closest,
      minutesUntilPlannedStart: m,
      plannedStartAtUtc: plan.plannedStartAtUtc,
      message: `${labelPrefix(plan.labels)}Planned changeover start in about ${Math.max(0, Math.round(m))} min (${closest}-min alert). Advisory only — confirm with the vessel's procedure.`,
      labels: plan.labels,
    });
  }
  return {
    due,
    skipped,
    skippedDetail,
    state: {
      firedThresholds: [...stillFired, ...newlyReached].sort((a, b) => b - a),
      // A valid plan clears the overdue latch.
      overdueFired: false,
      planSeen: true,
    },
  };
}
