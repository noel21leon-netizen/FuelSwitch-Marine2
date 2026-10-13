// Position model + quality assessment (pure). Never fabricates values: anything unusable is reported with a reason.
import { isValidLonLat } from '../geospatial/geo';
import { parseIsoUtc } from '../units';

export type PositionSource = 'browser-gps' | 'onboard-feed' | 'manual' | 'simulator';

export interface VesselPosition {
  readonly latitudeDeg: number;
  readonly longitudeDeg: number;
  readonly accuracyMeters: number | null;
  readonly observedAtUtc: string;
  readonly source: PositionSource;
  readonly sogKnots: number | null;
  readonly cogDegreesTrue: number | null;
  readonly isSimulated: boolean;
}

export type PositionRejectReason = 'no-position' | 'invalid-coordinates' | 'invalid-timestamp' | 'stale-fix' | 'poor-accuracy';

export type PositionAssessment =
  | { readonly ok: true; readonly position: VesselPosition; readonly ageSeconds: number; readonly warnings: string[] }
  | { readonly ok: false; readonly reason: PositionRejectReason; readonly explanation: string; readonly ageSeconds: number | null };

export interface PositionQualitySettings {
  readonly staleAfterSeconds: number;
  readonly maxAccuracyMeters: number;
}

/** Tolerated clock skew between the fix timestamp and "now". A fix further in the future is rejected. */
export const FUTURE_SKEW_TOLERANCE_SECONDS = 5;

export function assessPosition(
  position: VesselPosition | null | undefined,
  nowUtc: string,
  settings: PositionQualitySettings,
): PositionAssessment {
  if (!position) return { ok: false, reason: 'no-position', explanation: 'No position fix has been received.', ageSeconds: null };

  if (!isValidLonLat([position.longitudeDeg, position.latitudeDeg])) {
    return { ok: false, reason: 'invalid-coordinates', explanation: 'The position has missing or out-of-range coordinates.', ageSeconds: null };
  }
  const nowMs = parseIsoUtc(nowUtc);
  const fixMs = parseIsoUtc(position.observedAtUtc);
  if (nowMs === null || fixMs === null) {
    return { ok: false, reason: 'invalid-timestamp', explanation: 'The fix or current time is not a valid ISO UTC timestamp.', ageSeconds: null };
  }
  const rawAge = (nowMs - fixMs) / 1000;
  if (rawAge < -FUTURE_SKEW_TOLERANCE_SECONDS) {
    return { ok: false, reason: 'invalid-timestamp', explanation: 'The fix timestamp is in the future (device clock error?).', ageSeconds: rawAge };
  }
  const ageSeconds = Math.max(0, rawAge);
  if (ageSeconds > settings.staleAfterSeconds) {
    return {
      ok: false, reason: 'stale-fix', ageSeconds,
      explanation: `The last fix is ${Math.round(ageSeconds)} s old (limit ${settings.staleAfterSeconds} s).`,
    };
  }
  const warnings: string[] = [];
  const acc = position.accuracyMeters;
  if (acc === null || !Number.isFinite(acc) || acc < 0) {
    warnings.push('Position accuracy is unknown.');
  } else if (acc > settings.maxAccuracyMeters) {
    return {
      ok: false, reason: 'poor-accuracy', ageSeconds,
      explanation: `Position accuracy is ±${Math.round(acc)} m (limit ${settings.maxAccuracyMeters} m).`,
    };
  }
  return { ok: true, position, ageSeconds, warnings };
}

export type SogValidation =
  | { readonly ok: true; readonly sogKnots: number }
  | { readonly ok: false; readonly reason: 'sog-missing' | 'sog-zero-or-implausible'; readonly explanation: string };

export function validateSog(
  sogKnots: number | null | undefined,
  plausible: { readonly minKnots: number; readonly maxKnots: number },
): SogValidation {
  if (sogKnots === null || sogKnots === undefined || !Number.isFinite(sogKnots)) {
    return { ok: false, reason: 'sog-missing', explanation: 'Speed over ground is not available from this position source.' };
  }
  if (sogKnots < plausible.minKnots || sogKnots > plausible.maxKnots) {
    return {
      ok: false, reason: 'sog-zero-or-implausible',
      explanation: `SOG ${sogKnots.toFixed(1)} kn is outside the plausible range ${plausible.minKnots}–${plausible.maxKnots} kn.`,
    };
  }
  return { ok: true, sogKnots };
}
