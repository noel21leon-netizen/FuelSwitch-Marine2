// Skipped alert thresholds (pure). FR-008 / KOS 05. The SCHEDULER decides which thresholds are skipped and why (scheduler.ts);
// this file only names the reasons and words them. Nothing here reads a clock or re-derives a rule.

/**
 * already-passed-at-start: the countdown was already past this threshold the first time a usable plan was calculated in this session.
 * superseded-by-closer:    several thresholds were passed within one evaluation after that (plan jumped, long gap, settings changed);
 *                          only the closest was alerted.
 */
export type SkipReason = 'already-passed-at-start' | 'superseded-by-closer';

export interface SkippedThreshold {
  readonly thresholdMinutes: number;
  readonly reason: SkipReason;
  /** The closer threshold that WAS alerted in the same evaluation. */
  readonly alertedInsteadMinutes: number;
}

/** One line of plain advisory wording for the Dashboard. */
export function describeSkippedThreshold(s: SkippedThreshold): string {
  const head = `${s.thresholdMinutes}-min alert skipped:`;
  if (s.reason === 'already-passed-at-start') {
    return `${head} already passed when the first usable plan was calculated (the ${s.alertedInsteadMinutes}-min alert was raised instead).`;
  }
  return `${head} passed together with the closer ${s.alertedInsteadMinutes}-min threshold, so only that alert was raised.`;
}
