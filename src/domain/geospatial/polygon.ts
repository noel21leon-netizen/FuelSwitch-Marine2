// Polygon helpers (pure). Planar lon/lat geometry: valid for regional areas that do not cross the antimeridian (R-012).
import type { LonLat } from './geo';

/** rings[0] = outer ring, rings[1..] = holes. Rings are closed (first point == last point). */
export interface PolygonShape {
  readonly rings: readonly (readonly LonLat[])[];
}

/** Ray-casting point-in-ring. Points exactly on an edge are not defined; callers sample off the boundary. */
export function pointInRing(p: LonLat, ring: readonly LonLat[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (!a || !b) continue;
    const crosses = a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0];
    if (crosses) inside = !inside;
  }
  return inside;
}

export function pointInPolygon(p: LonLat, polygon: PolygonShape): boolean {
  const outer = polygon.rings[0];
  if (!outer || !pointInRing(p, outer)) return false;
  for (let h = 1; h < polygon.rings.length; h++) {
    const hole = polygon.rings[h];
    if (hole && pointInRing(p, hole)) return false;
  }
  return true;
}

export function pointInAnyPolygon(p: LonLat, polygons: readonly PolygonShape[]): boolean {
  return polygons.some((poly) => pointInPolygon(p, poly));
}

export type SegmentHit =
  | { readonly kind: 'point'; readonly t: number; readonly u: number }
  | { readonly kind: 'overlap'; readonly t: number };

const EPS = 1e-12;

/** Planar intersection of segment p→p2 with segment q→q2. t is the fraction along p→p2. */
export function intersectSegments(p: LonLat, p2: LonLat, q: LonLat, q2: LonLat): SegmentHit | null {
  const rx = p2[0] - p[0];
  const ry = p2[1] - p[1];
  const sx = q2[0] - q[0];
  const sy = q2[1] - q[1];
  const rLen = Math.hypot(rx, ry);
  const sLen = Math.hypot(sx, sy);
  if (rLen === 0 || sLen === 0) return null;
  const denom = rx * sy - ry * sx;
  const qpx = q[0] - p[0];
  const qpy = q[1] - p[1];
  if (Math.abs(denom) <= EPS * rLen * sLen) {
    // Parallel. Collinear only if q (and thus q2) lies on the line through p→p2.
    const offLine = Math.abs(qpx * ry - qpy * rx) / rLen;
    if (offLine > 1e-9) return null;
    const r2 = rx * rx + ry * ry;
    const tq = (qpx * rx + qpy * ry) / r2;
    const tq2 = ((q2[0] - p[0]) * rx + (q2[1] - p[1]) * ry) / r2;
    const lo = Math.max(0, Math.min(tq, tq2));
    const hi = Math.min(1, Math.max(tq, tq2));
    return lo <= hi + EPS ? { kind: 'overlap', t: lo } : null;
  }
  const t = (qpx * sy - qpy * sx) / denom;
  const u = (qpx * ry - qpy * rx) / denom;
  const tol = 1e-12;
  if (t < -tol || t > 1 + tol || u < -tol || u > 1 + tol) return null;
  return { kind: 'point', t: Math.max(0, Math.min(1, t)), u: Math.max(0, Math.min(1, u)) };
}
