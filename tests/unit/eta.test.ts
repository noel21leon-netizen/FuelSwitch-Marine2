import { describe, it, expect } from 'vitest';
import {
  analyzeRouteApproach, computeRouteEta, computeCourseProjectionEta, findRouteCrossings, parseIsoUtc, DEFAULT_DOMAIN_SETTINGS,
  type EtaResult, type PolygonShape,
} from '../../src/domain';
import { CURVED_ROUTE, EQ_ROUTE, MISSING_ROUTE, NM_PER_DEGREE, NOW, SQUARE, U_SHAPE, dataset, mustRoute, poly, position } from '../fixtures';

function avail(r: EtaResult) {
  if (r.status !== 'available') throw new Error(`expected available, got ${r.reason}: ${r.explanation}`);
  return r;
}
function why(r: EtaResult): string {
  if (r.status !== 'unavailable') throw new Error('expected unavailable');
  return r.reason;
}
const run = (over = {}, route = EQ_ROUTE as typeof EQ_ROUTE | null, ds = dataset()) =>
  computeRouteEta({ position: position(over), route, dataset: ds, nowUtc: NOW });

describe('RC-01: straight route, constant SOG', () => {
  it('ETA = route distance / SOG, crossing time anchored to the fix', () => {
    const eta = avail(run()); // vessel at lon -1, entry at lon 0 → 1° = 60.0405 nm, SOG 12 kn
    expect(eta.remainingDistanceNm).toBeCloseTo(NM_PER_DEGREE, 2);
    expect(eta.timeToCrossingHours).toBeCloseTo(NM_PER_DEGREE / 12, 4);
    const expectedMs = Date.parse(NOW) + (NM_PER_DEGREE / 12) * 3_600_000;
    expect(Math.abs((parseIsoUtc(eta.crossingAtUtc) as number) - expectedMs)).toBeLessThan(50);
    expect(eta.mode).toBe('route');
    expect(eta.crossingPointLonLatDeg[0]).toBeCloseTo(0, 6);
  });
  it('carries SIMULATED and DEMO labels', () => {
    const eta = avail(run());
    expect(eta.labels).toContain('SIMULATED');
    expect(eta.labels).toContain('DEMO DATA — NOT FOR NAVIGATION OR REGULATORY COMPLIANCE');
  });
  it('live (non-simulated) position is not labelled SIMULATED', () => {
    expect(avail(run({ isSimulated: false, source: 'browser-gps' })).labels).not.toContain('SIMULATED');
  });
});

describe('RC-02: route distance, not straight-line', () => {
  it('remaining distance follows the curved route', () => {
    const eta = avail(run({ latitudeDeg: 1, longitudeDeg: -3 }, CURVED_ROUTE));
    // 1° up to (-3,2)? vessel is at (-3,1): remaining = 1° (north) + 2° (east, lat 2) + 2° (south) + 1° (east) ≈ 6° ≈ 360.2 nm
    expect(eta.remainingDistanceNm).toBeCloseTo(6 * NM_PER_DEGREE, 0);
    const straightToEntry = Math.hypot(3, 1) * NM_PER_DEGREE; // ≈ 190 nm
    expect(eta.remainingDistanceNm).toBeGreaterThan(straightToEntry + 150);
    expect(eta.timeToCrossingHours).toBeCloseTo(eta.remainingDistanceNm / 12, 6);
  });
});

describe('unavailable cases give a reason, never a guess', () => {
  it('SOG missing / zero / implausible', () => {
    expect(why(run({ sogKnots: null }))).toBe('sog-missing');
    expect(why(run({ sogKnots: 0 }))).toBe('sog-zero-or-implausible');
    expect(why(run({ sogKnots: 0.3 }))).toBe('sog-zero-or-implausible');
    expect(why(run({ sogKnots: 55 }))).toBe('sog-zero-or-implausible');
  });
  it('no position / invalid / stale / poor accuracy', () => {
    expect(why(computeRouteEta({ position: null, route: EQ_ROUTE, dataset: dataset(), nowUtc: NOW }))).toBe('no-position');
    expect(why(run({ latitudeDeg: 200 }))).toBe('invalid-coordinates');
    expect(why(run({ observedAtUtc: '2026-10-12T05:58:00Z' }))).toBe('stale-fix');
    expect(why(run({ accuracyMeters: 500 }))).toBe('poor-accuracy');
  });
  it('no route selected', () => expect(why(run({}, null))).toBe('no-route'));
  it('RC-05: route misses polygon → no-crossing-found', () => {
    expect(why(run({ latitudeDeg: 5, longitudeDeg: -1 }, MISSING_ROUTE))).toBe('no-crossing-found');
  });
  it('RC-04: vessel already inside → already-inside', () => {
    expect(why(run({ longitudeDeg: 0.5 }))).toBe('already-inside');
  });
  it('vessel already passed through the area → no-crossing-found (no entry ahead)', () => {
    expect(why(run({ longitudeDeg: 1.6 }))).toBe('no-crossing-found');
  });
  it('ambiguous geometry: route along a boundary edge', () => {
    const edge = mustRoute([[-2, -0.5], [2, -0.5]]);
    expect(why(run({ latitudeDeg: -0.5, longitudeDeg: -1 }, edge))).toBe('ambiguous-geometry');
  });
  it('route/position disagree: next crossing ahead is an exit although vessel is outside', () => {
    // Vessel is 0.6° north of the equator (outside the square) but its nearest route point is INSIDE the square.
    const r = run({ latitudeDeg: 0.6, longitudeDeg: 0.5 });
    expect(why(r)).toBe('ambiguous-geometry');
  });
});

describe('RC-06: multiple crossings and grazing', () => {
  it('uses the NEXT entering crossing and warns about later entries', () => {
    const route = mustRoute([[-1, 2], [4, 2]]);
    const ds = dataset({ polygons: [U_SHAPE] });
    const eta = avail(computeRouteEta({ position: position({ latitudeDeg: 2, longitudeDeg: -0.5 }), route, dataset: ds, nowUtc: NOW }));
    expect(eta.crossingRouteDistanceNm).toBeCloseTo(NM_PER_DEGREE * 1, 1); // entering at lon 0
    expect(eta.warnings.join(' ')).toMatch(/further entering crossing/);
  });
  it('after the first entry the vessel is inside → already-inside', () => {
    const route = mustRoute([[-1, 2], [4, 2]]);
    const ds = dataset({ polygons: [U_SHAPE] });
    const r = computeRouteEta({ position: position({ latitudeDeg: 2, longitudeDeg: 0.5 }), route, dataset: ds, nowUtc: NOW });
    expect(why(r)).toBe('already-inside');
  });
  it('vessel in the notch (outside, between two lobes) → targets the second entry', () => {
    const route = mustRoute([[-1, 2], [4, 2]]);
    const ds = dataset({ polygons: [U_SHAPE] });
    const eta = avail(computeRouteEta({ position: position({ latitudeDeg: 2, longitudeDeg: 1.5 }), route, dataset: ds, nowUtc: NOW }));
    expect(eta.remainingDistanceNm).toBeCloseTo(0.5 * NM_PER_DEGREE, 1);
  });
  it('a graze alone is NOT an entry; it is reported', () => {
    const diamond: PolygonShape = poly([[0, 0], [0.5, 0.5], [1, 0], [0.5, -0.5], [0, 0]]);
    const route = mustRoute([[-1, 0.5], [2, 0.5]]);
    const r = computeRouteEta({ position: position({ latitudeDeg: 0.5, longitudeDeg: -0.5 }), route, dataset: dataset({ polygons: [diamond] }), nowUtc: NOW });
    expect(why(r)).toBe('no-crossing-found');
    if (r.status === 'unavailable') expect(r.explanation).toMatch(/touch-point/);
  });
});

describe('off-route handling', () => {
  it('moderately off-route: still available, with a lower-confidence warning', () => {
    const eta = avail(run({ latitudeDeg: 0.05 })); // ≈3 nm north of the route
    expect(eta.offRouteNm).toBeCloseTo(0.05 * NM_PER_DEGREE, 1);
    expect(eta.warnings.join(' ')).toMatch(/off the route/);
  });
  it('on route: no off-route warning', () => expect(avail(run()).warnings.join(' ')).not.toMatch(/off the route/));
});

describe('recalculation when inputs change', () => {
  it('doubling SOG halves the time; distance unchanged', () => {
    const a = avail(run({ sogKnots: 10 }));
    const b = avail(run({ sogKnots: 20 }));
    expect(b.timeToCrossingHours).toBeCloseTo(a.timeToCrossingHours / 2, 8);
    expect(b.remainingDistanceNm).toBeCloseTo(a.remainingDistanceNm, 8);
  });
  it('moving along the route reduces remaining distance by the distance moved', () => {
    const a = avail(run({ longitudeDeg: -1.5 }));
    const b = avail(run({ longitudeDeg: -0.5 }));
    expect(a.remainingDistanceNm - b.remainingDistanceNm).toBeCloseTo(NM_PER_DEGREE, 2);
  });
  it('switching route changes the result', () => {
    const eqEta = avail(run({ latitudeDeg: 0, longitudeDeg: -3 }, mustRoute([[-3, 0], [2, 0]])));
    const curved = avail(run({ latitudeDeg: 0, longitudeDeg: -3 }, CURVED_ROUTE));
    expect(curved.remainingDistanceNm).toBeGreaterThan(eqEta.remainingDistanceNm + 150);
  });
  it('long-leg regression: crossing classification is stable on a 25° leg at 60°N', () => {
    const big: PolygonShape = poly([[-20, 59], [-10, 59], [-10, 61], [-20, 61], [-20, 59]]);
    const route = mustRoute([[-30, 60], [-5, 60]]);
    const c = findRouteCrossings(route, [big]);
    expect(c.map((x) => x.direction)).toEqual(['entering', 'exiting']);
  });
});

describe('dataset gating of ETA (synthetic / unverified / expired)', () => {
  it('unverified dataset: ETA allowed but carries an UNVERIFIED label + warning', () => {
    const eta = avail(run({}, EQ_ROUTE, dataset({ verificationStatus: 'unverified', notice: null })));
    expect(eta.labels.join(' ')).toMatch(/UNVERIFIED/);
    expect(eta.warnings.join(' ')).toMatch(/UNVERIFIED/);
  });
  it('expired dataset: ETA blocked', () => {
    expect(why(run({}, EQ_ROUTE, dataset({ verificationStatus: 'expired' })))).toBe('dataset-not-usable');
  });
  it('verified dataset past its effective-to date: ETA blocked', () => {
    const ds = dataset({ verificationStatus: 'verified', effectiveFrom: '2020-01-01T00:00:00Z', effectiveTo: '2025-01-01T00:00:00Z', lastReviewedAtUtc: '2024-06-01T00:00:00Z', notice: null });
    expect(why(run({}, EQ_ROUTE, ds))).toBe('dataset-not-usable');
  });
  it('NOx dataset cannot drive a SOx ETA', () => {
    expect(why(run({}, EQ_ROUTE, dataset({ emissionCategory: 'NOX' })))).toBe('dataset-not-usable');
  });
  it('missing dataset blocks ETA', () => expect(why(run({}, EQ_ROUTE, null as never))).toBe('dataset-not-usable'));
});

describe('course-projection mode (labelled, optional)', () => {
  const cp = (over = {}, ds = dataset()) => computeCourseProjectionEta({ position: position(over), dataset: ds, nowUtc: NOW });
  it('heading east toward the square: ETA with explicit assumption text', () => {
    const eta = avail(cp({ cogDegreesTrue: 90, longitudeDeg: -0.5 })); // 30 nm from entry, inside the 50 nm default horizon
    expect(eta.mode).toBe('course-projection');
    expect(eta.remainingDistanceNm).toBeCloseTo(0.5 * NM_PER_DEGREE, 1);
    expect(eta.assumptions.join(' ')).toMatch(/assumes the current course and speed continue/);
  });
  it('entry beyond the default 50 nm horizon is not predicted (60 nm away)', () => {
    expect(why(cp({ cogDegreesTrue: 90 }))).toBe('projection-misses-boundary');
  });
  it('heading away: projection misses boundary', () => expect(why(cp({ cogDegreesTrue: 270 }))).toBe('projection-misses-boundary'));
  it('COG missing: unavailable (no fabricated course)', () => expect(why(cp({ cogDegreesTrue: null }))).toBe('cog-missing'));
  it('target beyond the horizon is not predicted', () => {
    expect(why(computeCourseProjectionEta({
      position: position({ longitudeDeg: -3 }), dataset: dataset(), nowUtc: NOW,
      settings: { ...DEFAULT_DOMAIN_SETTINGS, courseProjectionHorizonNm: 100 },
    }))).toBe('projection-misses-boundary'); // 3° ≈ 180 nm > 100 nm
  });
  it('already inside: no projection', () => expect(why(cp({ longitudeDeg: 0.5 }))).toBe('already-inside'));
});

describe('approach analysis does not need SOG', () => {
  it('distance to boundary is available even when SOG is missing', () => {
    const a = analyzeRouteApproach({ position: position({ sogKnots: null }), route: EQ_ROUTE, dataset: dataset({ polygons: [SQUARE] }), nowUtc: NOW });
    expect(a.status).toBe('available');
    if (a.status === 'available') expect(a.remainingDistanceNm).toBeCloseTo(NM_PER_DEGREE, 2);
  });
});
