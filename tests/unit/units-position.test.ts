import { describe, it, expect } from 'vitest';
import {
  METERS_PER_NAUTICAL_MILE, metersToNauticalMiles, nauticalMilesToMeters, metersPerSecondToKnots, knotsToMetersPerSecond,
  hoursToCover, distanceCoveredNm, hoursToMilliseconds, parseIsoUtc, toIsoUtc,
  assessPosition, validateSog, DEFAULT_DOMAIN_SETTINGS,
} from '../../src/domain';
import { NOW, position } from '../fixtures';

describe('units: knots, nautical miles, hours', () => {
  it('1 nm = 1852 m and round-trips', () => {
    expect(METERS_PER_NAUTICAL_MILE).toBe(1852);
    expect(metersToNauticalMiles(1852)).toBe(1);
    expect(nauticalMilesToMeters(2.5)).toBe(4630);
  });
  it('1 knot = 0.514444 m/s and back', () => {
    expect(knotsToMetersPerSecond(1)).toBeCloseTo(0.514444, 5);
    expect(metersPerSecondToKnots(0.514444)).toBeCloseTo(1, 5);
  });
  it('time = distance / speed', () => {
    expect(hoursToCover(12, 12)).toBe(1);
    expect(hoursToCover(30, 12)).toBe(2.5);
    expect(hoursToCover(0, 10)).toBe(0);
  });
  it('distance covered = speed × minutes / 60', () => {
    expect(distanceCoveredNm(12, 60)).toBe(12);
    expect(distanceCoveredNm(12, 45)).toBe(9);
  });
  it('hours → ms', () => expect(hoursToMilliseconds(1.5)).toBe(5_400_000));
  it('rejects invalid arithmetic inputs instead of returning Infinity/NaN', () => {
    expect(() => hoursToCover(10, 0)).toThrow();
    expect(() => hoursToCover(10, Number.NaN)).toThrow();
    expect(() => hoursToCover(-1, 10)).toThrow();
    expect(() => metersToNauticalMiles(Number.POSITIVE_INFINITY)).toThrow();
    expect(() => distanceCoveredNm(10, -5)).toThrow();
  });
});

describe('units: ISO UTC timestamps', () => {
  it('parses valid UTC instants', () => {
    expect(parseIsoUtc('2026-10-12T06:00:00Z')).toBe(Date.UTC(2026, 9, 12, 6, 0, 0));
    expect(parseIsoUtc('2026-10-12T06:00:00.250Z')).toBe(Date.UTC(2026, 9, 12, 6, 0, 0, 250));
  });
  it('rejects non-UTC, malformed and impossible dates', () => {
    expect(parseIsoUtc('2026-10-12T06:00:00+08:00')).toBeNull();
    expect(parseIsoUtc('2026-10-12 06:00:00Z')).toBeNull();
    expect(parseIsoUtc('2026-02-31T00:00:00Z')).toBeNull();
    expect(parseIsoUtc(12345)).toBeNull();
    expect(parseIsoUtc(null)).toBeNull();
  });
  it('formats ISO UTC', () => {
    expect(toIsoUtc(Date.UTC(2026, 9, 12, 6, 0, 0))).toBe('2026-10-12T06:00:00.000Z');
    expect(() => toIsoUtc(Number.NaN)).toThrow();
  });
});

describe('position quality (missing/invalid/stale/inaccurate)', () => {
  const s = DEFAULT_DOMAIN_SETTINGS;
  it('no position', () => {
    const r = assessPosition(null, NOW, s);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('no-position');
  });
  it('invalid coordinates (out of range / NaN)', () => {
    for (const bad of [{ latitudeDeg: 91 }, { longitudeDeg: -181 }, { latitudeDeg: Number.NaN }]) {
      const r = assessPosition(position(bad), NOW, s);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('invalid-coordinates');
    }
  });
  it('invalid and future timestamps', () => {
    const bad = assessPosition(position({ observedAtUtc: 'yesterday' }), NOW, s);
    if (!bad.ok) expect(bad.reason).toBe('invalid-timestamp'); else expect(true).toBe(false);
    const future = assessPosition(position({ observedAtUtc: '2026-10-12T06:01:00Z' }), NOW, s);
    if (!future.ok) expect(future.reason).toBe('invalid-timestamp'); else expect(true).toBe(false);
  });
  it('small clock skew into the future is tolerated', () => {
    expect(assessPosition(position({ observedAtUtc: '2026-10-12T06:00:03Z' }), NOW, s).ok).toBe(true);
  });
  it('stale fix: exactly at the limit ok, beyond it rejected', () => {
    expect(assessPosition(position({ observedAtUtc: '2026-10-12T05:59:30Z' }), NOW, s).ok).toBe(true);
    const r = assessPosition(position({ observedAtUtc: '2026-10-12T05:59:29Z' }), NOW, s);
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.reason).toBe('stale-fix'); expect(r.ageSeconds).toBe(31); }
  });
  it('poor accuracy rejected; unknown accuracy accepted with a warning', () => {
    const poor = assessPosition(position({ accuracyMeters: 150 }), NOW, s);
    if (!poor.ok) expect(poor.reason).toBe('poor-accuracy'); else expect(true).toBe(false);
    const unknown = assessPosition(position({ accuracyMeters: null }), NOW, s);
    expect(unknown.ok).toBe(true);
    if (unknown.ok) expect(unknown.warnings.join(' ')).toMatch(/accuracy is unknown/);
    expect(assessPosition(position({ accuracyMeters: 100 }), NOW, s).ok).toBe(true);
  });
});

describe('SOG validation', () => {
  const range = DEFAULT_DOMAIN_SETTINGS.plausibleSogKnots;
  it('missing', () => {
    for (const v of [null, undefined, Number.NaN]) {
      const r = validateSog(v, range);
      if (!r.ok) expect(r.reason).toBe('sog-missing'); else expect(true).toBe(false);
    }
  });
  it('zero / below minimum / above maximum are implausible', () => {
    for (const v of [0, 0.4, 41]) {
      const r = validateSog(v, range);
      if (!r.ok) expect(r.reason).toBe('sog-zero-or-implausible'); else expect(true).toBe(false);
    }
  });
  it('plausible values pass through unchanged', () => {
    const r = validateSog(12.3, range);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.sogKnots).toBe(12.3);
    expect(validateSog(0.5, range).ok).toBe(true);
    expect(validateSog(40, range).ok).toBe(true);
  });
});
