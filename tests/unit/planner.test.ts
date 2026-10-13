import { describe, it, expect } from 'vitest';
import {
  computeRouteEta, planChangeover, ManualVerifiedDurationCalculator, haversineNm, parseIsoUtc,
  type ChangeoverCalculator, type ChangeoverPlanResult, type EtaResult,
} from '../../src/domain';
import { CURVED_ROUTE, EQ_ROUTE, MISSING_ROUTE, NM_PER_DEGREE, NOW, dataset, position } from '../fixtures';

const eta = (over = {}, route = EQ_ROUTE): EtaResult => computeRouteEta({ position: position(over), route, dataset: dataset(), nowUtc: NOW });
const plan = (e: EtaResult, dur: number | null, margin: number | null, now = NOW) =>
  planChangeover(e, new ManualVerifiedDurationCalculator(dur), margin, now);
function ok(r: ChangeoverPlanResult) {
  if (r.status !== 'available') throw new Error(`expected available, got ${r.reason}`);
  return r;
}
const reason = (r: ChangeoverPlanResult) => { if (r.status !== 'unavailable') throw new Error('expected unavailable'); return r.reason; };

describe('RC-03: planned start = crossing − duration − margin (45 + 15 min)', () => {
  const e = eta(); // vessel at lon -1 on EQ_ROUTE, SOG 12, crossing 60.04 nm ahead → 5.0034 h
  const p = ok(plan(e, 45, 15));
  it('start time is exactly 60 minutes before the crossing', () => {
    const diff = (parseIsoUtc(p.predictedCrossingAtUtc) as number) - (parseIsoUtc(p.plannedStartAtUtc) as number);
    expect(diff).toBe(60 * 60_000);
  });
  it('planned start distance = SOG × 60 min = 12 nm before the crossing (FR-007)', () => {
    expect(p.plannedStartDistanceBeforeCrossingNm).toBe(12);
    expect(p.plannedStartRouteDistanceNm).toBeCloseTo(2 * NM_PER_DEGREE - 12, 2);
  });
  it('planned start POINT is 12 nm back along the route from the entry point (lon ≈ -0.19987)', () => {
    expect(p.plannedStartPointLonLatDeg?.[0]).toBeCloseTo(-12 / NM_PER_DEGREE, 4);
    expect(p.plannedStartPointLonLatDeg?.[1]).toBeCloseTo(0, 6);
  });
  it('time until start is reported relative to now', () => {
    expect(p.minutesUntilPlannedStart).toBeCloseTo(5.0034 * 60 - 60, 1);
  });
  it('duration source is labelled and is NOT presented as FOBAS', () => {
    expect(p.durationMethod).toBe('manual-verified');
    expect(p.durationLabel).toMatch(/user-verified/);
    expect(p.durationLabel).toMatch(/NOT a FOBAS result/);
    expect(p.assumptions.join(' ')).toMatch(/SOG stays constant/);
  });
  it('labels from the ETA (SIMULATED / DEMO) are carried through', () => expect(p.labels).toContain('SIMULATED'));
});

describe('planned start point follows the route, not a straight line (FR-007)', () => {
  it('on the curved route the start point lies on the route leg, not on the straight chord', () => {
    // Vessel at (-3,0): crossing at route distance 7° ≈ 420 nm; SOG 60 kn, 120 min lead → 120 nm back → 300 nm along route.
    const e = eta({ latitudeDeg: 0, longitudeDeg: -3, sogKnots: 30 }, CURVED_ROUTE);
    const p = ok(plan(e, 100, 20)); // 120 min × 30 kn = 60 nm before crossing → route distance ≈ 360 nm
    expect(p.plannedStartDistanceBeforeCrossingNm).toBe(60);
    const pt = p.plannedStartPointLonLatDeg;
    expect(pt).not.toBeNull();
    // 60 nm before crossing along the route = 60 nm west of (0,0) on the final equatorial leg, i.e. lon ≈ -1.0 (the leg starts at -1)
    expect(pt?.[0]).toBeCloseTo(-60 / NM_PER_DEGREE, 2);
    expect(pt?.[1]).toBeCloseTo(0, 4);
    // and the straight-line distance from vessel to start point is NOT the route distance covered
    const routeCovered = p.plannedStartRouteDistanceNm - 0;
    expect(routeCovered).toBeGreaterThan(haversineNm([-3, 0], pt as [number, number]) + 100);
  });
});

describe('planner unavailable cases', () => {
  const e = eta();
  it('duration missing / zero / NaN', () => {
    expect(reason(plan(e, null, 15))).toBe('duration-missing');
    expect(reason(plan(e, 0, 15))).toBe('duration-missing');
    expect(reason(plan(e, Number.NaN, 15))).toBe('duration-missing');
  });
  it('margin must be set explicitly (no silent default); 0 is allowed; negative rejected', () => {
    expect(reason(plan(e, 45, null))).toBe('margin-missing');
    expect(reason(plan(e, 45, -1))).toBe('margin-missing');
    expect(plan(e, 45, 0).status).toBe('available');
  });
  it('start-overdue: crossing closer than duration + margin, details kept', () => {
    const near = eta({ longitudeDeg: -0.0833 }); // ≈ 5 nm from entry, SOG 12 → 25 min; lead 60 min
    const r = plan(near, 45, 15);
    expect(reason(r)).toBe('start-overdue');
    if (r.status === 'unavailable') {
      expect(r.details?.overdueByMinutes).toBeGreaterThan(30);
      expect(r.details?.plannedStartAtUtc).toBeTruthy();
    }
  });
  it('start becomes overdue as time passes (now later than planned start)', () => {
    const ok1 = plan(e, 45, 15, NOW);
    expect(ok1.status).toBe('available');
    const later = plan(e, 45, 15, '2026-10-12T10:30:00Z'); // planned start ≈ 10:00
    expect(reason(later)).toBe('start-overdue');
  });
  it('ETA unavailable passes its reason through (RC-05, SOG missing)', () => {
    expect(reason(plan(eta({ latitudeDeg: 5, longitudeDeg: -1 }, MISSING_ROUTE), 45, 15))).toBe('no-crossing-found');
    expect(reason(plan(eta({ sogKnots: null }), 45, 15))).toBe('sog-missing');
  });
});

describe('recalculation when duration, margin, SOG or route change', () => {
  const base = eta();
  const startMs = (r: ChangeoverPlanResult) => parseIsoUtc(ok(r).plannedStartAtUtc) as number;
  it('increasing duration moves the planned start earlier by the same amount', () => {
    expect(startMs(plan(base, 45, 15)) - startMs(plan(base, 60, 15))).toBe(15 * 60_000);
  });
  it('increasing margin moves the planned start earlier by the same amount', () => {
    expect(startMs(plan(base, 45, 15)) - startMs(plan(base, 45, 30))).toBe(15 * 60_000);
  });
  it('higher SOG: crossing earlier and start point further back', () => {
    const slow = ok(plan(eta({ sogKnots: 10 }), 45, 15));
    const fast = ok(plan(eta({ sogKnots: 20 }), 45, 15));
    expect(fast.plannedStartDistanceBeforeCrossingNm).toBe(20);
    expect(slow.plannedStartDistanceBeforeCrossingNm).toBe(10);
    expect(parseIsoUtc(fast.predictedCrossingAtUtc) as number).toBeLessThan(parseIsoUtc(slow.predictedCrossingAtUtc) as number);
  });
});

describe('ChangeoverCalculator port', () => {
  it('a validated-engine calculator is NOT implemented; the port accepts only what is supplied', () => {
    const fake: ChangeoverCalculator = {
      method: 'validated-engine',
      calculate: () => ({ ok: true, minutes: 30, method: 'validated-engine', label: 'TEST DOUBLE ONLY' }),
    };
    const p = ok(planChangeover(eta(), fake, 10, NOW));
    expect(p.durationMethod).toBe('validated-engine'); // plumbing works; no real FOBAS implementation exists
    expect(p.durationLabel).toBe('TEST DOUBLE ONLY');
  });
});
