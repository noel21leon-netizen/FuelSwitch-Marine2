// Route geometry along a polyline (pure). Distances are ALONG THE ROUTE, never straight-line (FR-007).
import { haversineNm, isValidLonLat, type LonLat } from './geo';

export interface Route {
  readonly points: readonly LonLat[];
  /** cumulativeNm[i] = route distance from the first point to points[i], in nautical miles. */
  readonly cumulativeNm: readonly number[];
  readonly totalNm: number;
}

export type RouteBuildResult =
  | { readonly ok: true; readonly route: Route }
  | { readonly ok: false; readonly explanation: string };

/** Build a Route. Rejects <2 points, invalid coordinates, zero length and antimeridian jumps (unsupported, R-012). */
export function buildRoute(points: readonly (readonly number[])[]): RouteBuildResult {
  if (!Array.isArray(points) || points.length < 2) {
    return { ok: false, explanation: 'A route needs at least two waypoints.' };
  }
  const clean: LonLat[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (!isValidLonLat(p)) return { ok: false, explanation: `Waypoint ${i + 1} has invalid coordinates.` };
    const prev = clean[clean.length - 1];
    if (prev && Math.abs(p[0] - prev[0]) > 180) {
      return { ok: false, explanation: 'Routes crossing the antimeridian are not supported yet (R-012).' };
    }
    clean.push([p[0], p[1]]);
  }
  const cumulativeNm: number[] = [0];
  for (let i = 1; i < clean.length; i++) {
    const a = clean[i - 1];
    const b = clean[i];
    if (!a || !b) return { ok: false, explanation: 'Internal route error.' };
    cumulativeNm.push((cumulativeNm[i - 1] ?? 0) + haversineNm(a, b));
  }
  const totalNm = cumulativeNm[cumulativeNm.length - 1] ?? 0;
  if (!(totalNm > 0)) return { ok: false, explanation: 'Route has zero length.' };
  return { ok: true, route: { points: clean, cumulativeNm, totalNm } };
}

/** Straight-line (great-circle) distance first→last waypoint. Diagnostics only — never a substitute for route distance. */
export function straightLineNm(route: Route): number {
  const first = route.points[0];
  const last = route.points[route.points.length - 1];
  if (!first || !last) return 0;
  return haversineNm(first, last);
}

/** Point at `distanceNm` along the route; null if outside [0, totalNm].
 *  Within a leg the point is a linear blend in lon/lat (error not quantified for long legs, R-011: densify long legs). */
export function pointAtRouteDistance(route: Route, distanceNm: number): LonLat | null {
  if (!Number.isFinite(distanceNm) || distanceNm < 0 || distanceNm > route.totalNm + 1e-9) return null;
  const d = Math.min(distanceNm, route.totalNm);
  for (let i = 1; i < route.points.length; i++) {
    const endCum = route.cumulativeNm[i] ?? 0;
    if (d <= endCum + 1e-12) {
      const a = route.points[i - 1];
      const b = route.points[i];
      const startCum = route.cumulativeNm[i - 1] ?? 0;
      if (!a || !b) return null;
      const segLen = endCum - startCum;
      if (segLen <= 0) return [b[0], b[1]];
      const t = (d - startCum) / segLen;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
  }
  const last = route.points[route.points.length - 1];
  return last ? [last[0], last[1]] : null;
}

export interface RouteProjection {
  readonly alongRouteNm: number;
  readonly offRouteNm: number;
  readonly segmentIndex: number;
  readonly nearestPointLonLat: LonLat;
}

/** Project a position onto the nearest point of the route. Local planar approximation selects the segment; distances are haversine. */
export function projectOnRoute(
  route: Route,
  position: LonLat,
  /** Optional inclusive segment-index window (used by progress-continuity, R-019). Omitted = every segment. */
  segmentWindow?: { readonly fromSegment: number; readonly toSegment: number },
): RouteProjection {
  const cosLat = Math.cos((position[1] * Math.PI) / 180);
  let best: RouteProjection | null = null;
  const first = Math.max(0, segmentWindow?.fromSegment ?? 0);
  const last = Math.min(route.points.length - 2, segmentWindow?.toSegment ?? route.points.length - 2);
  for (let i = first; i <= last; i++) {
    const a = route.points[i];
    const b = route.points[i + 1];
    if (!a || !b) continue;
    const rx = (b[0] - a[0]) * cosLat;
    const ry = b[1] - a[1];
    const px = (position[0] - a[0]) * cosLat;
    const py = position[1] - a[1];
    const len2 = rx * rx + ry * ry;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (px * rx + py * ry) / len2));
    const nearest: LonLat = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const off = haversineNm(position, nearest);
    if (best === null || off < best.offRouteNm) {
      best = {
        // Same parametrisation as pointAtRouteDistance: fraction of the leg × leg length.
        alongRouteNm: (route.cumulativeNm[i] ?? 0) + t * ((route.cumulativeNm[i + 1] ?? 0) - (route.cumulativeNm[i] ?? 0)),
        offRouteNm: off,
        segmentIndex: i,
        nearestPointLonLat: nearest,
      };
    }
  }
  if (!best) throw new Error('Route has no segments in the requested window');
  return best;
}
