// Default thresholds. ALL are PROPOSED engineering defaults, user-configurable, and NONE is a regulatory value (KOS 05).
export interface DomainSettings {
  readonly staleAfterSeconds: number;
  readonly maxAccuracyMeters: number;
  readonly plausibleSogKnots: { readonly minKnots: number; readonly maxKnots: number };
  readonly offRouteToleranceNm: number;
  /** Course-projection mode: how far ahead the assumed-course ray is extended. */
  readonly courseProjectionHorizonNm: number;
}

export const DEFAULT_DOMAIN_SETTINGS: DomainSettings = {
  staleAfterSeconds: 30,
  maxAccuracyMeters: 100,
  plausibleSogKnots: { minKnots: 0.5, maxKnots: 40 },
  offRouteToleranceNm: 1,
  courseProjectionHorizonNm: 50,
};

/** Alert lead times before planned changeover start (minutes). PROPOSED. */
export const DEFAULT_ALERT_THRESHOLDS_MINUTES: readonly number[] = [60, 30, 15, 5];
