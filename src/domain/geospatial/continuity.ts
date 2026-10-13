// Progress-continuity for route projection (R-019). Pure.
// Problem: on a route that passes near itself (loop, hairpin, doubled-back leg) the globally nearest point can lie on the WRONG leg,
// which would jump "distance along route" forwards or backwards. Fix: once progress is known, only consider route segments whose
// along-route span overlaps a window around the previous progress; fall back to the global projection (flagged) if the window fits badly.
import type { LonLat } from './geo';
import { projectOnRoute, type Route, type RouteProjection } from './route';

export interface ProgressHint {
  /** Along-route distance (nm) of the previous accepted fix. */
  readonly previousAlongRouteNm: number;
}

export interface ContinuityOptions {
  /** How far BACK from the previous progress the vessel may appear (GPS noise / small reversals). Default 2 nm. */
  readonly maxBackNm?: number;
  /** How far AHEAD of the previous progress a single update may jump. Default 25 nm (PROPOSED; user-configurable by callers). */
  readonly maxForwardNm?: number;
  /** If the windowed fit is farther than this from the route, the hint is distrusted and the global projection is used. */
  readonly offRouteToleranceNm: number;
}

export const DEFAULT_CONTINUITY_BACK_NM = 2;
export const DEFAULT_CONTINUITY_FORWARD_NM = 25;

export interface ContinuousProjection extends RouteProjection {
  /** 'window' = hint honoured; 'global' = no hint; 'global-fallback' = hint distrusted (window fit poor), result may have jumped. */
  readonly method: 'window' | 'global' | 'global-fallback';
}

export function projectWithContinuity(
  route: Route,
  position: LonLat,
  hint: ProgressHint | null | undefined,
  options: ContinuityOptions,
): ContinuousProjection {
  const prev = hint?.previousAlongRouteNm;
  if (prev === undefined || !Number.isFinite(prev) || prev < 0) {
    return { ...projectOnRoute(route, position), method: 'global' };
  }
  const lo = prev - (options.maxBackNm ?? DEFAULT_CONTINUITY_BACK_NM);
  const hi = prev + (options.maxForwardNm ?? DEFAULT_CONTINUITY_FORWARD_NM);

  // A segment i spans [cumulativeNm[i], cumulativeNm[i+1]]; keep those overlapping [lo, hi].
  let from = -1;
  let to = -1;
  for (let i = 0; i < route.points.length - 1; i++) {
    const a = route.cumulativeNm[i] ?? 0;
    const b = route.cumulativeNm[i + 1] ?? 0;
    if (b >= lo && a <= hi) {
      if (from === -1) from = i;
      to = i;
    }
  }
  if (from === -1) return { ...projectOnRoute(route, position), method: 'global-fallback' };

  const windowed = projectOnRoute(route, position, { fromSegment: from, toSegment: to });
  if (windowed.offRouteNm > options.offRouteToleranceNm) {
    return { ...projectOnRoute(route, position), method: 'global-fallback' };
  }
  return { ...windowed, method: 'window' };
}
