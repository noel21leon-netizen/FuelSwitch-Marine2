import { describe, it, expect } from 'vitest';
import { localInputToUtcIso, utcIsoToLocalInput } from '../../src/features/changeover-log/timeInput';

describe('datetime-local conversion', () => {
  it('round-trips a local value through UTC (timezone independent)', () => {
    const iso = localInputToUtcIso('2026-10-12T14:30');
    expect(iso).toMatch(/^2026-10-1[12]T\d{2}:\d{2}:00Z$/);
    expect(utcIsoToLocalInput(iso as string)).toBe('2026-10-12T14:30');
  });
  it('produces whole-second ISO UTC with a Z suffix', () => {
    expect(localInputToUtcIso('2026-10-12T00:00')).toMatch(/:00Z$/);
  });
  it('rejects empty, malformed and impossible dates', () => {
    expect(localInputToUtcIso('')).toBeNull();
    expect(localInputToUtcIso('12/10/2026 14:30')).toBeNull();
    expect(localInputToUtcIso('2026-02-31T10:00')).toBeNull();
  });
  it('returns an empty string for an invalid ISO instant', () => {
    expect(utcIsoToLocalInput('nonsense')).toBe('');
  });
});
