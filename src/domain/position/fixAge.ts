// Fix-age presentation (pure, no clock). FR-001 / KOS 02. Turns a position assessment into a text status with the stale limit.
// Never produces an age number unless one was actually computed from a received fix with a valid timestamp (CLAUDE.md rule 9).
import type { PositionAssessment } from './position';

export type FixAgeStatus = 'fresh' | 'stale' | 'unavailable';

export interface FixAgeView {
  readonly status: FixAgeStatus;
  /** Whole seconds; null whenever no trustworthy age exists. */
  readonly ageSeconds: number | null;
  readonly limitSeconds: number;
  /** One line for the Dashboard, e.g. "12 s — fresh (stale after 30 s)". */
  readonly text: string;
  /** Why unavailable / stale; null when fresh. */
  readonly reason: string | null;
}

export function describeFixAge(assessment: PositionAssessment | null, staleAfterSeconds: number): FixAgeView {
  const limit = staleAfterSeconds;
  if (assessment === null) {
    const reason = 'Monitoring has not produced a status yet.';
    return { status: 'unavailable', ageSeconds: null, limitSeconds: limit, text: `Unavailable — ${reason}`, reason };
  }
  if (assessment.ok) {
    const age = Math.round(assessment.ageSeconds);
    return { status: 'fresh', ageSeconds: age, limitSeconds: limit, text: `${age} s — fresh (stale after ${limit} s)`, reason: null };
  }
  if (assessment.reason === 'stale-fix' && assessment.ageSeconds !== null) {
    const age = Math.round(assessment.ageSeconds);
    return { status: 'stale', ageSeconds: age, limitSeconds: limit, text: `${age} s — STALE (limit ${limit} s)`, reason: assessment.explanation };
  }
  if (assessment.reason === 'poor-accuracy' && assessment.ageSeconds !== null) {
    // The age was measured and is within the limit; the fix is rejected for accuracy, which is shown separately.
    const age = Math.round(assessment.ageSeconds);
    return { status: 'fresh', ageSeconds: age, limitSeconds: limit, text: `${age} s — fresh (stale after ${limit} s); fix not used: ${assessment.explanation}`, reason: assessment.explanation };
  }
  // no-position, invalid-coordinates, invalid-timestamp (incl. future timestamp): no trustworthy age → no number.
  return { status: 'unavailable', ageSeconds: null, limitSeconds: limit, text: `Unavailable — ${assessment.explanation}`, reason: assessment.explanation };
}
