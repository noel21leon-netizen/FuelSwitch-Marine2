import { describe, it, expect } from 'vitest';
import {
  haversineNm, destinationPoint, initialBearingDeg, buildRoute, straightLineNm, pointAtRouteDistance, projectOnRoute,
  pointInPolygon, findRouteCrossings, parseIsoUtc,
} from '../../src/domain';
import { CURVED_ROUTE, DIAMOND, EQ_ROUTE, HOLED, MISSING_ROUTE, NM_PER_DEGREE, SQUARE, U_SHAPE, loadBundledSynthetic, mustRoute } from '../fixtures';

describe('geodesy', () => {
  it('1° of longitude on the equator = 60.0405 nm (independent hand constant)', () => {
    expect(haversineNm([0, 0], [1, 0])).toBeCloseTo(NM_PER_DEGREE, 3);
  });
  it('1° of latitude = 60.0405 nm', () => expect(haversineNm([10, 20], [10, 21])).toBeCloseTo(NM_PER_DEGREE, 3));
  it('bearing east = 90, north = 0', () => {
    expect(initialBearingDeg([0, 0], [1, 0])).toBeCloseTo(90, 6);
    expect(initialBearingDeg([0, 0], [0, 1])).toBeCloseTo(0, 6);
  });
  it('destination round-trips with haversine', () => {
    const p = destinationPoint([5, 10], 45, 100);
    expect(haversineNm([5, 10], p)).toBeCloseTo(100, 6);
    const east = destinationPoint([0, 0], 90, NM_PER_DEGREE);
    expect(east[0]).toBeCloseTo(1, 3);
    expect(east[1]).toBeCloseTo(0, 6);
  });
  it('rejects invalid destination inputs', () => {
    expect(() => destinationPoint([0, 0], Number.NaN, 1)).toThrow();
    expect(() => destinationPoint([0, 0], 90, -1)).toThrow();
  });
});

describe('route building and distance (FR-007)', () => {
  it('rejects too few points, bad coordinates, zero length, antimeridian jumps', () => {
    expect(buildRoute([[0, 0]]).ok).toBe(false);
    expect(buildRoute([[0, 0], [0, 95]]).ok).toBe(false);
    expect(buildRoute([[1, 1], [1, 1]]).ok).toBe(false);
    const anti = buildRoute([[179, 0], [-179, 0]]);
    expect(anti.ok).toBe(false);
    if (!anti.ok) expect(anti.explanation).toMatch(/antimeridian/);
  });
  it('straight route: total = 4° = 240.16 nm', () => expect(EQ_ROUTE.totalNm).toBeCloseTo(4 * NM_PER_DEGREE, 2));
  it('RC-02: curved route distance is clearly greater than straight-line', () => {
    const straight = straightLineNm(CURVED_ROUTE);
    expect(straight).toBeCloseTo(5 * NM_PER_DEGREE, 0); // -3° → +2° along the equator
    expect(CURVED_ROUTE.totalNm).toBeGreaterThan(straight + 200);
    expect(CURVED_ROUTE.totalNm / straight).toBeGreaterThan(1.7);
  });
  it('bundled synthetic route is nearly straight (documented finding), so not used for RC-02', () => {
    const { route } = loadBundledSynthetic();
    expect(route.totalNm - straightLineNm(route)).toBeLessThan(5);
  });
  it('pointAtRouteDistance walks along legs and rejects out-of-range', () => {
    const p = pointAtRouteDistance(CURVED_ROUTE, 2 * NM_PER_DEGREE);
    expect(p?.[0]).toBeCloseTo(-3, 3);
    expect(p?.[1]).toBeCloseTo(2, 3);
    expect(pointAtRouteDistance(CURVED_ROUTE, -1)).toBeNull();
    expect(pointAtRouteDistance(CURVED_ROUTE, CURVED_ROUTE.totalNm + 1)).toBeNull();
    const end = pointAtRouteDistance(CURVED_ROUTE, CURVED_ROUTE.totalNm);
    expect(end?.[0]).toBeCloseTo(2, 6);
  });
  it('projectOnRoute: on-route and off-route', () => {
    const on = projectOnRoute(EQ_ROUTE, [-1, 0]);
    expect(on.alongRouteNm).toBeCloseTo(NM_PER_DEGREE, 2);
    expect(on.offRouteNm).toBeCloseTo(0, 6);
    const off = projectOnRoute(EQ_ROUTE, [0, 0.1]);
    expect(off.alongRouteNm).toBeCloseTo(2 * NM_PER_DEGREE, 2);
    expect(off.offRouteNm).toBeCloseTo(0.1 * NM_PER_DEGREE, 2);
  });
  it('projectOnRoute clamps before the start and past the end', () => {
    expect(projectOnRoute(EQ_ROUTE, [-5, 0]).alongRouteNm).toBe(0);
    expect(projectOnRoute(EQ_ROUTE, [9, 0]).alongRouteNm).toBeCloseTo(EQ_ROUTE.totalNm, 6);
  });
});

describe('point in polygon', () => {
  it('inside / outside the square', () => {
    expect(pointInPolygon([0.5, 0], SQUARE)).toBe(true);
    expect(pointInPolygon([1.5, 0], SQUARE)).toBe(false);
  });
  it('holes are outside', () => {
    expect(pointInPolygon([0.5, 0.5], HOLED)).toBe(true);
    expect(pointInPolygon([2, 2], HOLED)).toBe(false);
  });
});

describe('boundary crossings (entry/exit, RC-01, RC-05, RC-06)', () => {
  it('RC-01: west→east route enters at 2° and exits at 3°', () => {
    const c = findRouteCrossings(EQ_ROUTE, [SQUARE]);
    expect(c).toHaveLength(2);
    expect(c[0]?.direction).toBe('entering');
    expect(c[0]?.routeDistanceFromStartNm).toBeCloseTo(2 * NM_PER_DEGREE, 2);
    expect(c[0]?.pointLonLatDeg[0]).toBeCloseTo(0, 6);
    expect(c[1]?.direction).toBe('exiting');
    expect(c[1]?.routeDistanceFromStartNm).toBeCloseTo(3 * NM_PER_DEGREE, 2);
  });
  it('reversed route: exiting first, then entering', () => {
    const rev = mustRoute([[2, 0], [-2, 0]]);
    const c = findRouteCrossings(rev, [SQUARE]);
    expect(c.map((x) => x.direction)).toEqual(['entering', 'exiting']);
    expect(c[0]?.pointLonLatDeg[0]).toBeCloseTo(1, 6); // now enters through the EAST edge
  });
  it('RC-05: no crossing when the route misses the polygon', () => {
    expect(findRouteCrossings(MISSING_ROUTE, [SQUARE])).toHaveLength(0);
  });
  it('RC-06: boundary grazing (touch at one vertex) is classified grazing, not entering', () => {
    const touch = mustRoute([[-1, 0.5], [2, 0.5]]);
    const c = findRouteCrossings(touch, [DIAMOND]);
    expect(c).toHaveLength(1);
    expect(c[0]?.direction).toBe('grazing');
  });
  it('RC-06: multiple crossings of a concave (U) polygon, in order', () => {
    const r = mustRoute([[-1, 2], [4, 2]]);
    const c = findRouteCrossings(r, [U_SHAPE]);
    expect(c.map((x) => x.direction)).toEqual(['entering', 'exiting', 'entering', 'exiting']);
    const d = c.map((x) => x.routeDistanceFromStartNm);
    expect([...d].sort((a, b) => a - b)).toEqual(d);
  });
  it('a route vertex lying exactly on the boundary is one crossing, not two', () => {
    const r = mustRoute([[-1, 0], [0, 0], [2, 0]]);
    const c = findRouteCrossings(r, [SQUARE]);
    expect(c.map((x) => x.direction)).toEqual(['entering', 'exiting']);
  });
  it('polygon with a hole: enter, exit into hole, re-enter, exit', () => {
    const r = mustRoute([[-1, 2], [5, 2]]);
    const c = findRouteCrossings(r, [HOLED]);
    expect(c.map((x) => x.direction)).toEqual(['entering', 'exiting', 'entering', 'exiting']);
  });
  it('route running along an edge is ambiguous', () => {
    const r = mustRoute([[-1, -0.5], [2, -0.5]]);
    const c = findRouteCrossings(r, [SQUARE]);
    expect(c.length).toBeGreaterThan(0);
    expect(c.some((x) => x.direction === 'ambiguous')).toBe(true);
  });
  it('route starting exactly on the boundary is ambiguous', () => {
    const r = mustRoute([[0, 0], [2, 0]]);
    const c = findRouteCrossings(r, [SQUARE]);
    expect(c[0]?.direction).toBe('ambiguous');
  });
  it('bundled synthetic fixture: route enters then leaves the synthetic polygon (2 crossings)', () => {
    const { dataset, route } = loadBundledSynthetic();
    const c = findRouteCrossings(route, dataset.polygons);
    expect(c.map((x) => x.direction)).toEqual(['entering', 'exiting']);
  });
  it('sanity: helper timestamps used elsewhere parse', () => expect(parseIsoUtc('2026-10-12T06:00:00Z')).not.toBeNull());
});
