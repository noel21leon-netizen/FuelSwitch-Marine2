// FR-001: fix age with stale limit and text status (pure). Never a made-up age when there is no usable fix.
import { describe, it, expect } from 'vitest';
import { assessPosition, describeFixAge, DEFAULT_DOMAIN_SETTINGS, toIsoUtc, parseIsoUtc } from '../../src/domain';
import { NOW, position } from '../fixtures';

const S = DEFAULT_DOMAIN_SETTINGS; // staleAfterSeconds 30, maxAccuracyMeters 100
const at = (offsetSeconds: number): string => toIsoUtc((parseIsoUtc(NOW) as number) + offsetSeconds * 1000);

describe('describeFixAge', () => {
  it('fresh fix: whole-second age, status text and the limit', () => {
    const v = describeFixAge(assessPosition(position(), at(12.4), S), S.staleAfterSeconds);
    expect(v.status).toBe('fresh');
    expect(v.ageSeconds).toBe(12);
    expect(v.limitSeconds).toBe(30);
    expect(v.text).toBe('12 s — fresh (stale after 30 s)');
    expect(v.reason).toBeNull();
  });

  it('age exactly at the limit is still fresh; one second more is stale (hand-derived: > limit is stale)', () => {
    expect(describeFixAge(assessPosition(position(), at(30), S), 30).status).toBe('fresh');
    const v = describeFixAge(assessPosition(position(), at(31), S), 30);
    expect(v.status).toBe('stale');
    expect(v.ageSeconds).toBe(31);
    expect(v.text).toBe('31 s — STALE (limit 30 s)');
    expect(v.reason).toMatch(/31 s old/);
  });

  it('no fix: unavailable with the reason, and NO number', () => {
    const v = describeFixAge(assessPosition(null, NOW, S), 30);
    expect(v.status).toBe('unavailable');
    expect(v.ageSeconds).toBeNull();
    expect(v.text).toBe('Unavailable — No position fix has been received.');
    expect(v.text).not.toMatch(/\d+ s/);
  });

  it('before monitoring has produced any status (null assessment): unavailable, no number', () => {
    const v = describeFixAge(null, 30);
    expect(v.status).toBe('unavailable');
    expect(v.ageSeconds).toBeNull();
    expect(v.reason).toMatch(/not produced a status/);
  });

  it('fix timestamp in the future: unavailable, never a negative or clamped age', () => {
    const v = describeFixAge(assessPosition(position(), at(-60), S), 30);
    expect(v.status).toBe('unavailable');
    expect(v.ageSeconds).toBeNull();
    expect(v.text).toMatch(/future/);
  });

  it('invalid coordinates or timestamp: unavailable, no number', () => {
    expect(describeFixAge(assessPosition(position({ latitudeDeg: 99 }), NOW, S), 30).ageSeconds).toBeNull();
    expect(describeFixAge(assessPosition(position({ observedAtUtc: 'garbage' }), NOW, S), 30).ageSeconds).toBeNull();
  });

  it('poor accuracy: the age IS known and fresh, and the text says the fix is not used', () => {
    const v = describeFixAge(assessPosition(position({ accuracyMeters: 500 }), at(5), S), 30);
    expect(v.status).toBe('fresh');
    expect(v.ageSeconds).toBe(5);
    expect(v.text).toMatch(/^5 s — fresh/);
    expect(v.text).toMatch(/not used/);
    expect(v.reason).toMatch(/500 m/);
  });

  it('echoes whatever limit it is given (no hard-coded 30)', () => {
    expect(describeFixAge(assessPosition(position(), at(5), { ...S, staleAfterSeconds: 90 }), 90).text).toBe('5 s — fresh (stale after 90 s)');
  });
});
