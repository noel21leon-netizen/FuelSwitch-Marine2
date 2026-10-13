// Changeover planner (pure). KOS 05 "Planned changeover start" / "Planned start point".
// Duration comes from a ChangeoverCalculator. Only the MANUAL-VERIFIED calculator exists: the FOBAS-compatible method is UNKNOWN
// and is deliberately NOT implemented (no authorised method or benchmark cases yet).
import type { LonLat } from '../geospatial/geo';
import { pointAtRouteDistance } from '../geospatial/route';
import { distanceCoveredNm, MS_PER_MINUTE, parseIsoUtc, toIsoUtc } from '../units';
import type { EtaResult, Unavailable } from '../eta/eta';

export type DurationMethod = 'manual-verified' | 'validated-engine';

export type ChangeoverDurationContext = Readonly<Record<string, unknown>>;

export type DurationResult =
  | { readonly ok: true; readonly minutes: number; readonly method: DurationMethod; readonly label: string }
  | { readonly ok: false; readonly reason: 'duration-missing'; readonly explanation: string };

/** Port for obtaining a changeover duration. A validated-engine implementation may be added ONLY after an authorised method + benchmarks are reviewed. */
export interface ChangeoverCalculator {
  readonly method: DurationMethod;
  calculate(context?: ChangeoverDurationContext): DurationResult;
}

/** User-entered duration the user states they verified (e.g. from the vessel's own procedure). Labelled "manual-verified" everywhere. */
export class ManualVerifiedDurationCalculator implements ChangeoverCalculator {
  readonly method = 'manual-verified' as const;
  constructor(private readonly minutes: number | null) {}
  calculate(): DurationResult {
    if (this.minutes === null || !Number.isFinite(this.minutes) || this.minutes <= 0) {
      return { ok: false, reason: 'duration-missing', explanation: 'No manually verified changeover duration has been entered.' };
    }
    return { ok: true, minutes: this.minutes, method: this.method, label: 'Manually entered duration (user-verified; NOT a FOBAS result)' };
  }
}

export interface ChangeoverPlanAvailable {
  readonly status: 'available';
  readonly plannedStartAtUtc: string;
  readonly predictedCrossingAtUtc: string;
  readonly durationMinutes: number;
  readonly marginMinutes: number;
  readonly durationMethod: DurationMethod;
  readonly durationLabel: string;
  /** Distance before the crossing at which changeover should start, along the path, at constant SOG. */
  readonly plannedStartDistanceBeforeCrossingNm: number;
  readonly plannedStartRouteDistanceNm: number;
  /** null when the start point would precede the start of the path. */
  readonly plannedStartPointLonLatDeg: LonLat | null;
  readonly minutesUntilPlannedStart: number;
  readonly assumptions: string[];
  readonly warnings: string[];
  readonly labels: string[];
}

export interface ChangeoverPlanUnavailable extends Unavailable {
  /** Present for start-overdue so the information is not hidden. */
  readonly details?: { readonly plannedStartAtUtc: string; readonly overdueByMinutes: number };
}
export type ChangeoverPlanResult = ChangeoverPlanAvailable | ChangeoverPlanUnavailable;

export function planChangeover(
  eta: EtaResult,
  calculator: ChangeoverCalculator,
  safetyMarginMinutes: number | null,
  nowUtc: string,
  context?: ChangeoverDurationContext,
): ChangeoverPlanResult {
  if (eta.status === 'unavailable') return eta;

  const duration = calculator.calculate(context);
  if (!duration.ok) return { status: 'unavailable', reason: 'duration-missing', explanation: duration.explanation };
  if (safetyMarginMinutes === null || !Number.isFinite(safetyMarginMinutes) || safetyMarginMinutes < 0) {
    return { status: 'unavailable', reason: 'margin-missing', explanation: 'Set a safety margin (minutes, ≥ 0). There is no default; it is a company/vessel decision.' };
  }
  const nowMs = parseIsoUtc(nowUtc);
  const crossingMs = parseIsoUtc(eta.crossingAtUtc);
  if (nowMs === null || crossingMs === null) {
    return { status: 'unavailable', reason: 'invalid-timestamp', explanation: 'Current time or crossing time is not valid ISO UTC.' };
  }

  const leadMinutes = duration.minutes + safetyMarginMinutes;
  const plannedStartMs = crossingMs - leadMinutes * MS_PER_MINUTE;
  const plannedStartAtUtc = toIsoUtc(plannedStartMs);

  const startBeforeCrossingNm = distanceCoveredNm(eta.sogKnots, leadMinutes);
  const startRouteDistanceNm = eta.crossingRouteDistanceNm - startBeforeCrossingNm;

  const behindVessel = startRouteDistanceNm < eta.vesselAlongPathNm;
  const inPast = plannedStartMs < nowMs;
  if (behindVessel || inPast) {
    return {
      status: 'unavailable', reason: 'start-overdue',
      explanation: 'The planned changeover start time has already passed. The crossing is closer than duration + margin at the current speed.',
      details: { plannedStartAtUtc, overdueByMinutes: Math.max(0, (nowMs - plannedStartMs) / MS_PER_MINUTE) },
    };
  }

  const warnings = [...eta.warnings];
  const point = startRouteDistanceNm >= 0 ? pointAtRouteDistance(eta.path, startRouteDistanceNm) : null;
  if (point === null) warnings.push('The planned start point would be before the start of the path; no point is shown.');

  return {
    status: 'available',
    plannedStartAtUtc,
    predictedCrossingAtUtc: eta.crossingAtUtc,
    durationMinutes: duration.minutes,
    marginMinutes: safetyMarginMinutes,
    durationMethod: duration.method,
    durationLabel: duration.label,
    plannedStartDistanceBeforeCrossingNm: startBeforeCrossingNm,
    plannedStartRouteDistanceNm: startRouteDistanceNm,
    plannedStartPointLonLatDeg: point,
    minutesUntilPlannedStart: (plannedStartMs - nowMs) / MS_PER_MINUTE,
    assumptions: [
      ...eta.assumptions,
      'Planned start = predicted crossing − changeover duration − safety margin.',
      'Start point assumes SOG stays constant over the lead time.',
    ],
    warnings,
    labels: eta.labels,
  };
}

/** Type guard helper for callers. */
export function isPlanAvailable(r: ChangeoverPlanResult): r is ChangeoverPlanAvailable {
  return r.status === 'available';
}
