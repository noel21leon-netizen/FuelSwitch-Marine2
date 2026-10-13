// R-019: progress-continuity for route projection. Hand-derivable hairpin route.
//   A: (0,0)→(2,0)      = 2 × 60.0405 = 120.081 nm
//   B: (2,0)→(2,0.1)    = 0.1 × 60.0405 = 6.004 nm
//   C: (2,0.1)→(0,0.1)  = 120.081 × cos(0.1°) ≈ 120.0808 nm  (lies 6.0 nm north of A, so the two legs are "near each other")
// A vessel on leg C at lon 1.0 sits at along ≈ 120.081 + 6.004 + 60.040 = 186.125 nm.
import { describe, it, expect } from 'vitest';
import { analyzeRouteApproach, projectOnRoute, projectWithContinuity, DEFAULT_DOMAIN_SETTINGS, type LonLat } from '../../src/domain';
import { dataset, mustRoute, NOW, position, SQUARE, EQ_ROUTE } from '../fixtures';

const HAIRPIN = mustRoute([[0, 0], [2, 0], [2, 0.1], [0, 0.1]]);
// Vessel on leg C but pulled 0.06° south by a position error, so the WRONG leg (A) is nearer: A 2.4 nm, C 3.6 nm.
const NOISY: LonLat = [1.0, 0.04];

describe('hairpin route: why continuity is needed', () => {
  it('global projection picks the wrong leg (documents the R-019 defect)', () => {
    const p = projectOnRoute(HAIRPIN, NOISY);
    expect(p.segmentIndex).toBe(0);
    expect(p.alongRouteNm).toBeCloseTo(60.04, 1);
  });
});

describe('projectWithContinuity', () => {
  it('stays on the leg the vessel was already on', () => {
    const p = projectWithContinuity(HAIRPIN, NOISY, { previousAlongRouteNm: 185 }, { offRouteToleranceNm: 5 });
    expect(p.method).toBe('window');
    expect(p.segmentIndex).toBe(2);
    expect(p.alongRouteNm).toBeCloseTo(186.125, 1);
  });
  it('uses the global projection when there is no hint', () => {
    const p = projectWithContinuity(HAIRPIN, NOISY, null, { offRouteToleranceNm: 5 });
    expect(p.method).toBe('global');
    expect(p.segmentIndex).toBe(0);
  });
  it('treats a negative or non-finite hint as no hint', () => {
    expect(projectWithContinuity(HAIRPIN, NOISY, { previousAlongRouteNm: -1 }, { offRouteToleranceNm: 5 }).method).toBe('global');
    expect(projectWithContinuity(HAIRPIN, NOISY, { previousAlongRouteNm: Number.NaN }, { offRouteToleranceNm: 5 }).method).toBe('global');
  });
  it('distrusts the hint and falls back (flagged) when the windowed fit is worse than the tolerance', () => {
    const p = projectWithContinuity(HAIRPIN, NOISY, { previousAlongRouteNm: 185 }, { offRouteToleranceNm: 1 });
    expect(p.method).toBe('global-fallback');
    expect(p.segmentIndex).toBe(0);
  });
  it('falls back when the hint lies beyond the end of the route', () => {
    expect(projectWithContinuity(HAIRPIN, NOISY, { previousAlongRouteNm: 5000 }, { offRouteToleranceNm: 5 }).method).toBe('global-fallback');
  });
  it('limits a single-update jump forward (maxForwardNm)', () => {
    // previous 60 on leg A, window forward only 5 nm → leg C (starting at 126 nm) is excluded even if it were nearer.
    const p = projectWithContinuity(HAIRPIN, [1.0, 0.09], { previousAlongRouteNm: 60 }, { offRouteToleranceNm: 10, maxForwardNm: 5 });
    expect(p.segmentIndex).toBe(0);
  });
});

describe('analyzeRouteApproach with a progress hint', () => {
  const input = { position: position({ longitudeDeg: -1, latitudeDeg: 0 }), route: EQ_ROUTE, dataset: dataset({ polygons: [SQUARE] }), nowUtc: NOW };
  it('gives the same answer as no hint when the hint is consistent', () => {
    const a = analyzeRouteApproach(input);
    const b = analyzeRouteApproach({ ...input, progressHint: { previousAlongRouteNm: 60 } });
    if (a.status !== 'available' || b.status !== 'available') throw new Error('expected available');
    expect(b.remainingDistanceNm).toBeCloseTo(a.remainingDistanceNm, 6);
    expect(b.remainingDistanceNm).toBeCloseTo(60.0405, 3);
  });
  // Polygon lies across leg A only (lon 1.5–1.8, lat ≤ 0.05): the entry is at along 1.5 × 60.0405 = 90.06 nm; leg C (lat 0.1) never touches it.
  const AHEAD_ON_A = dataset({ polygons: [{ rings: [[[1.5, -0.5], [1.8, -0.5], [1.8, 0.05], [1.5, 0.05], [1.5, -0.5]] as LonLat[]] }] });
  const noisy = position({ longitudeDeg: 1.0, latitudeDeg: 0.04 });

  it('adds a visible warning when continuity had to be abandoned (global fallback)', () => {
    const r = analyzeRouteApproach({
      position: noisy, route: HAIRPIN, nowUtc: NOW, dataset: AHEAD_ON_A, progressHint: { previousAlongRouteNm: 185 },
      settings: { ...DEFAULT_DOMAIN_SETTINGS, offRouteToleranceNm: 1 },
    });
    if (r.status !== 'available') throw new Error('expected available');
    expect(r.warnings.join(' ')).toMatch(/could not be tracked continuously/);
    expect(r.remainingDistanceNm).toBeCloseTo(30.02, 1);
  });
  it('does NOT predict the entry that is behind the vessel on the loop (the wrong-leg ETA is avoided)', () => {
    const r = analyzeRouteApproach({
      position: noisy, route: HAIRPIN, nowUtc: NOW, dataset: AHEAD_ON_A, progressHint: { previousAlongRouteNm: 185 },
      settings: { ...DEFAULT_DOMAIN_SETTINGS, offRouteToleranceNm: 5 },
    });
    expect(r.status).toBe('unavailable');
    if (r.status === 'unavailable') expect(r.reason).toBe('no-crossing-found');
  });
});
