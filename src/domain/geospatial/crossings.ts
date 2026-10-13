// Route ↔ polygon boundary crossing detection (pure). KOS 05 "Boundary crossing detection".
import type { LonLat } from './geo';
import { intersectSegments, pointInAnyPolygon, type PolygonShape } from './polygon';
import { pointAtRouteDistance, type Route } from './route';

export type CrossingDirection = 'entering' | 'exiting' | 'grazing' | 'ambiguous';

export interface CrossingCandidate {
  readonly pointLonLatDeg: LonLat;
  readonly routeDistanceFromStartNm: number;
  readonly direction: CrossingDirection;
}

/** Hits closer than this along the route are the same crossing (e.g. a vertex shared by two edges). */
const MERGE_NM = 1e-6;
/** Distance before/after a crossing at which inside/outside is sampled to classify direction. PROPOSED; polygons narrower than this are unsupported. */
export const DIRECTION_SAMPLE_NM = 0.01;

interface RawHit {
  readonly distanceNm: number;
  readonly point: LonLat;
  readonly overlap: boolean;
}

/** All boundary crossings of `route` with the polygons, sorted by distance along the route. */
export function findRouteCrossings(route: Route, polygons: readonly PolygonShape[]): CrossingCandidate[] {
  const raw: RawHit[] = [];
  for (const polygon of polygons) {
    for (const ring of polygon.rings) {
      for (let e = 0; e < ring.length - 1; e++) {
        const q = ring[e];
        const q2 = ring[e + 1];
        if (!q || !q2) continue;
        for (let i = 0; i < route.points.length - 1; i++) {
          const p = route.points[i];
          const p2 = route.points[i + 1];
          if (!p || !p2) continue;
          const hit = intersectSegments(p, p2, q, q2);
          if (!hit) continue;
          const point: LonLat = [p[0] + (p2[0] - p[0]) * hit.t, p[1] + (p2[1] - p[1]) * hit.t];
          raw.push({
            // Same parametrisation as pointAtRouteDistance (fraction × leg length) so sampled points agree with the hit.
            distanceNm: (route.cumulativeNm[i] ?? 0) + hit.t * ((route.cumulativeNm[i + 1] ?? 0) - (route.cumulativeNm[i] ?? 0)),
            point,
            overlap: hit.kind === 'overlap',
          });
        }
      }
    }
  }
  raw.sort((a, b) => a.distanceNm - b.distanceNm);

  const merged: RawHit[] = [];
  for (const hit of raw) {
    const last = merged[merged.length - 1];
    if (last && hit.distanceNm - last.distanceNm < MERGE_NM) {
      if (hit.overlap && !last.overlap) merged[merged.length - 1] = { ...last, overlap: true };
    } else {
      merged.push(hit);
    }
  }

  return merged.map((hit) => ({
    pointLonLatDeg: hit.point,
    routeDistanceFromStartNm: hit.distanceNm,
    direction: classify(route, polygons, hit),
  }));
}

function classify(route: Route, polygons: readonly PolygonShape[], hit: RawHit): CrossingDirection {
  if (hit.overlap) return 'ambiguous'; // route runs along a boundary edge
  const d = hit.distanceNm;
  if (d < DIRECTION_SAMPLE_NM || route.totalNm - d < DIRECTION_SAMPLE_NM) return 'ambiguous'; // route starts/ends on the boundary
  const before = pointAtRouteDistance(route, d - DIRECTION_SAMPLE_NM);
  const after = pointAtRouteDistance(route, d + DIRECTION_SAMPLE_NM);
  if (!before || !after) return 'ambiguous';
  const insideBefore = pointInAnyPolygon(before, polygons);
  const insideAfter = pointInAnyPolygon(after, polygons);
  if (!insideBefore && insideAfter) return 'entering';
  if (insideBefore && !insideAfter) return 'exiting';
  // Same state on both sides: outside→outside is a graze (touch); inside→inside is a shared/internal edge.
  return insideBefore ? 'ambiguous' : 'grazing';
}
