// FR-010 / NFR-005: dataset status presenter. Expected values are hand-written, never produced by the code under test.
// Dates are chosen against NOW = 2026-10-12T06:00:00Z (fixtures).
import { describe, it, expect } from 'vitest';
import { describeDatasetStatus, evaluateDatasetUsability, UNKNOWN_SOURCE_TEXT, type DatasetStatusView } from '../../src/domain';
import { DEMO_BANNER_TEXT } from '../../src/shared/constants';
import { NOW, dataset, loadBundledSynthetic } from '../fixtures';

const verified = (over = {}) => dataset({
  verificationStatus: 'verified', notice: null, sourceName: 'test source', sourceUrl: 'https://example.invalid/src',
  datasetVersion: '2026.1', effectiveFrom: '2025-01-01T00:00:00Z', effectiveTo: '2030-01-01T00:00:00Z', lastReviewedAtUtc: '2026-01-01T00:00:00Z', ...over,
});
const unverified = (over = {}) => dataset({ verificationStatus: 'unverified', notice: null, sourceName: 'test source', datasetVersion: '1.0', ...over });
const kinds = (v: DatasetStatusView): string[] => v.notices.map((n) => n.kind);

describe('describeDatasetStatus: nothing loaded', () => {
  it.each([[null], [undefined]])('is UNAVAILABLE with a blocking not-loaded notice (%s)', (d) => {
    const v = describeDatasetStatus(d, NOW);
    expect(v.loaded).toBe(false);
    expect(v.usable).toBe(false);
    expect(v.statusLabel).toBe('UNAVAILABLE');
    expect(v.declaredStatus).toBeNull();
    expect(v.datasetName).toBeNull();
    expect(kinds(v)).toEqual(['not-loaded']);
    expect(v.notices[0]?.severity).toBe('block');
    expect(v.summaryLine).toBe('Unavailable — local dataset not loaded');
    expect(v.sourceName).toBe(UNKNOWN_SOURCE_TEXT);
  });
});

describe('describeDatasetStatus: synthetic', () => {
  it('shows SYNTHETIC with the exact DEMO banner as a warning', () => {
    const v = describeDatasetStatus(dataset({ sourceName: 'fictional test polygon' }), NOW);
    expect(v.statusLabel).toBe('SYNTHETIC');
    expect(v.usable).toBe(true);
    expect(v.notices).toEqual([{ kind: 'synthetic', severity: 'warn', text: DEMO_BANNER_TEXT }]);
    expect(v.summaryLine).toBe('TEST SQUARE (synthetic) (SYNTHETIC) — demo data');
  });
  it('falls back to the DEMO banner when the dataset carries no notice', () => {
    const v = describeDatasetStatus(dataset({ notice: null }), NOW);
    expect(v.notices[0]?.text).toBe(DEMO_BANNER_TEXT);
  });
  it('the bundled synthetic dataset is SYNTHETIC, usable, version 0.1.0-synthetic, and its source is known', () => {
    const v = describeDatasetStatus(loadBundledSynthetic().dataset, NOW);
    expect(v.statusLabel).toBe('SYNTHETIC');
    expect(v.usable).toBe(true);
    expect(v.datasetVersion).toBe('0.1.0-synthetic');
    expect(v.sourceKnown).toBe(true);
    expect(v.sourceName).toBe('Hand-made fictional polygon for software testing');
    expect(kinds(v)).toEqual(['synthetic']);
  });
  it('synthetic data is never labelled VERIFIED or shown without its demo wording', () => {
    const v = describeDatasetStatus(dataset(), NOW);
    expect(v.statusLabel).not.toBe('VERIFIED');
    expect(v.summaryLine).toContain('demo data');
  });
});

describe('describeDatasetStatus: unverified', () => {
  it('is usable but carries the UNVERIFIED warning and is never summarised as plain current data', () => {
    const v = describeDatasetStatus(unverified(), NOW);
    expect(v.statusLabel).toBe('UNVERIFIED');
    expect(v.usable).toBe(true);
    expect(kinds(v)).toEqual(['unverified']);
    expect(v.notices[0]?.severity).toBe('warn');
    expect(v.notices[0]?.text).toBe('UNVERIFIED BOUNDARY — NOT FOR NAVIGATION OR REGULATORY COMPLIANCE');
    expect(v.summaryLine).toBe('TEST SQUARE (synthetic) (UNVERIFIED) — not verified');
  });
  it('past its effective-to date it is EXPIRED and not usable (not merely "unverified")', () => {
    const v = describeDatasetStatus(unverified({ effectiveTo: '2026-10-12T05:59:59Z' }), NOW);
    expect(v.statusLabel).toBe('EXPIRED');
    expect(v.usable).toBe(false);
    expect(kinds(v)).toEqual(['expired']);
  });
});

describe('describeDatasetStatus: verified', () => {
  it('inside its dates with an end date: VERIFIED, no notices, plain summary', () => {
    const v = describeDatasetStatus(verified(), NOW);
    expect(v.statusLabel).toBe('VERIFIED');
    expect(v.usable).toBe(true);
    expect(v.notices).toEqual([]);
    expect(v.summaryLine).toBe('TEST SQUARE (synthetic) (VERIFIED)');
    expect(v.effectiveFrom).toBe('2025-01-01T00:00:00Z');
    expect(v.effectiveTo).toBe('2030-01-01T00:00:00Z');
    expect(v.lastReviewedAtUtc).toBe('2026-01-01T00:00:00Z');
  });
  it('no end date recorded: still VERIFIED but carries the domain warning verbatim (not "valid forever")', () => {
    const v = describeDatasetStatus(verified({ effectiveTo: null }), NOW);
    expect(v.statusLabel).toBe('VERIFIED');
    expect(kinds(v)).toEqual(['no-end-date']);
    expect(v.notices[0]?.text).toBe('No effective-to date is recorded; confirm the dataset is still in force.');
    expect(v.notices[0]?.severity).toBe('warn');
  });
  it('DECLARED verified but past its end date is shown as EXPIRED, never VERIFIED', () => {
    const v = describeDatasetStatus(verified({ effectiveTo: '2026-10-12T05:59:59Z' }), NOW);
    expect(v.declaredStatus).toBe('verified');
    expect(v.statusLabel).toBe('EXPIRED');
    expect(v.usable).toBe(false);
    expect(v.notices[0]?.severity).toBe('block');
    expect(v.notices[0]?.text).toContain('has expired (effective to 2026-10-12T05:59:59Z)');
    expect(v.notices[0]?.text).toContain('not used for calculations');
    expect(v.summaryLine).toBe('EXPIRED — TEST SQUARE (synthetic) (not used)');
    expect(v.summaryLine).not.toContain('VERIFIED');
  });
  it('the boundary instant itself is still in force (nowUtc == effectiveTo is not expired)', () => {
    expect(describeDatasetStatus(verified({ effectiveTo: NOW }), NOW).statusLabel).toBe('VERIFIED');
  });
  it('before effective-from: NOT YET EFFECTIVE, blocked', () => {
    const v = describeDatasetStatus(verified({ effectiveFrom: '2026-10-12T06:00:01Z' }), NOW);
    expect(v.statusLabel).toBe('NOT YET EFFECTIVE');
    expect(v.usable).toBe(false);
    expect(kinds(v)).toEqual(['not-yet-effective']);
  });
  it('verified without a review timestamp: NOT USABLE (incomplete metadata), not VERIFIED', () => {
    const v = describeDatasetStatus(verified({ lastReviewedAtUtc: null }), NOW);
    expect(v.statusLabel).toBe('NOT USABLE');
    expect(v.usable).toBe(false);
    expect(kinds(v)).toEqual(['blocked']);
  });
});

describe('describeDatasetStatus: expired and other blocked states', () => {
  it('a dataset marked EXPIRED is EXPIRED and blocked', () => {
    const v = describeDatasetStatus(dataset({ verificationStatus: 'expired' }), NOW);
    expect(v.statusLabel).toBe('EXPIRED');
    expect(v.usable).toBe(false);
    expect(v.notices[0]?.text).toBe('Dataset "TEST SQUARE (synthetic)" is marked EXPIRED. It is not used for calculations.');
  });
  it('wrong emission category, no polygons, bad dates and a bad clock are NOT USABLE with a blocking notice', () => {
    const cases = [
      describeDatasetStatus(dataset({ emissionCategory: 'NOX' }), NOW),
      describeDatasetStatus(dataset({ polygons: [] }), NOW),
      describeDatasetStatus(verified({ effectiveFrom: 'not-a-date' }), NOW),
      describeDatasetStatus(dataset(), 'yesterday'),
    ];
    for (const v of cases) {
      expect(v.statusLabel).toBe('NOT USABLE');
      expect(v.usable).toBe(false);
      expect(v.notices[0]?.severity).toBe('block');
      expect(v.summaryLine).toBe('NOT USABLE — TEST SQUARE (synthetic) (not used)');
    }
  });
  it('a NOX dataset assessed for NOX purpose is evaluated normally', () => {
    expect(describeDatasetStatus(dataset({ emissionCategory: 'NOX' }), NOW, 'NOX').statusLabel).toBe('SYNTHETIC');
  });
});

describe('describeDatasetStatus: unknown source / version', () => {
  it.each([[''], ['   '], ['unknown'], ['UNKNOWN']])('source %j is shown as UNKNOWN with a warning', (src) => {
    const v = describeDatasetStatus(verified({ sourceName: src }), NOW);
    expect(v.sourceKnown).toBe(false);
    expect(v.sourceName).toBe('UNKNOWN');
    expect(kinds(v)).toContain('unknown-source');
    expect(v.notices.find((n) => n.kind === 'unknown-source')?.severity).toBe('warn');
    expect(v.summaryLine).toBe('TEST SQUARE (synthetic) (VERIFIED) — source unknown');
  });
  it('an unrecorded version (the parser default "unknown") is flagged as info and shown as UNKNOWN', () => {
    const v = describeDatasetStatus(verified({ datasetVersion: 'unknown' }), NOW);
    expect(v.versionKnown).toBe(false);
    expect(v.datasetVersion).toBe('UNKNOWN');
    expect(v.notices.find((n) => n.kind === 'unknown-version')?.severity).toBe('info');
  });
  it('an expired dataset with an unknown source reports both notices, block first', () => {
    const v = describeDatasetStatus(verified({ sourceName: '', effectiveTo: '2026-01-01T00:00:00Z' }), NOW);
    expect(kinds(v)).toEqual(['expired', 'unknown-source']);
  });
});

describe('describeDatasetStatus: reuses the domain rules (ADR-037)', () => {
  it('usable agrees with evaluateDatasetUsability for a spread of datasets and times', () => {
    const times = ['2024-06-01T00:00:00Z', NOW, '2031-01-01T00:00:00Z', 'garbage'];
    const sets = [dataset(), unverified(), verified(), verified({ effectiveTo: null }), dataset({ verificationStatus: 'expired' }), dataset({ polygons: [] }), verified({ lastReviewedAtUtc: null })];
    for (const d of sets) for (const t of times) {
      expect(describeDatasetStatus(d, t).usable).toBe(evaluateDatasetUsability(d, t, 'SOX_PM').usable);
    }
  });
  it('every blocked result from the domain rules carries a machine-readable code', () => {
    const u = evaluateDatasetUsability(verified({ effectiveTo: '2026-01-01T00:00:00Z' }), NOW, 'SOX_PM');
    expect(u.usable).toBe(false);
    if (!u.usable) expect(u.code).toBe('past-effective-to');
    const m = evaluateDatasetUsability(dataset({ verificationStatus: 'expired' }), NOW, 'SOX_PM');
    if (!m.usable) expect(m.code).toBe('marked-expired');
    const n = evaluateDatasetUsability(null, NOW, 'SOX_PM');
    if (!n.usable) expect(n.code).toBe('no-dataset');
  });
  it('is deterministic for the same inputs', () => {
    expect(describeDatasetStatus(verified(), NOW)).toEqual(describeDatasetStatus(verified(), NOW));
  });
});
