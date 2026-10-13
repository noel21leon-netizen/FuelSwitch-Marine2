import { describe, it, expect } from 'vitest';
import { evaluateDatasetUsability, parseDatasetFromGeoJson, assessNoxInputs, NOX_DISCLAIMER, type DatasetUsability } from '../../src/domain';
import { NOW, dataset, loadBundledSynthetic, readRepoJson } from '../fixtures';

const verified = (over = {}) => dataset({
  verificationStatus: 'verified', notice: null, sourceName: 'test source', sourceUrl: 'https://example.invalid/src',
  effectiveFrom: '2025-01-01T00:00:00Z', effectiveTo: '2030-01-01T00:00:00Z', lastReviewedAtUtc: '2026-01-01T00:00:00Z', ...over,
});
const blockedWhy = (u: DatasetUsability) => (u.usable ? 'NOT BLOCKED' : u.reason);

describe('dataset usability rules (KOS 07 status behaviour)', () => {
  it('synthetic: usable with the exact DEMO banner', () => {
    const u = evaluateDatasetUsability(dataset(), NOW, 'SOX_PM');
    expect(u.usable).toBe(true);
    if (u.usable) {
      expect(u.level).toBe('demo');
      expect(u.bannerText).toBe('DEMO DATA — NOT FOR NAVIGATION OR REGULATORY COMPLIANCE');
    }
  });
  it('synthetic without a notice still shows the DEMO banner', () => {
    const u = evaluateDatasetUsability(dataset({ notice: null }), NOW, 'SOX_PM');
    if (u.usable) expect(u.bannerText).toBe('DEMO DATA — NOT FOR NAVIGATION OR REGULATORY COMPLIANCE');
    else expect(true).toBe(false);
  });
  it('unverified: usable ONLY with explicit warning + banner', () => {
    const u = evaluateDatasetUsability(dataset({ verificationStatus: 'unverified', notice: null }), NOW, 'SOX_PM');
    expect(u.usable).toBe(true);
    if (u.usable) { expect(u.level).toBe('unverified'); expect(u.bannerText).toMatch(/UNVERIFIED/); expect(u.warnings.length).toBeGreaterThan(0); }
  });
  it('verified inside effective dates: usable, no banner', () => {
    const u = evaluateDatasetUsability(verified(), NOW, 'SOX_PM');
    expect(u.usable).toBe(true);
    if (u.usable) { expect(u.level).toBe('verified'); expect(u.bannerText).toBeNull(); }
  });
  it('verified without effectiveTo: usable but warns that "no end date" ≠ "valid forever"', () => {
    const u = evaluateDatasetUsability(verified({ effectiveTo: null }), NOW, 'SOX_PM');
    expect(u.usable).toBe(true);
    if (u.usable) expect(u.warnings.join(' ')).toMatch(/No effective-to date/);
  });
  it('verified without effectiveFrom or review timestamp: blocked', () => {
    expect(blockedWhy(evaluateDatasetUsability(verified({ effectiveFrom: null }), NOW, 'SOX_PM'))).toMatch(/effective-from/);
    expect(blockedWhy(evaluateDatasetUsability(verified({ lastReviewedAtUtc: null }), NOW, 'SOX_PM'))).toMatch(/review timestamp/);
  });
  it('expired status: blocked', () => expect(blockedWhy(evaluateDatasetUsability(dataset({ verificationStatus: 'expired' }), NOW, 'SOX_PM'))).toMatch(/EXPIRED/));
  it('past effectiveTo: blocked even if labelled verified', () => {
    expect(blockedWhy(evaluateDatasetUsability(verified({ effectiveTo: '2026-10-11T23:59:59Z' }), NOW, 'SOX_PM'))).toMatch(/expired/);
  });
  it('before effectiveFrom: blocked (not yet effective), also for unverified', () => {
    expect(blockedWhy(evaluateDatasetUsability(verified({ effectiveFrom: '2027-01-01T00:00:00Z', effectiveTo: '2030-01-01T00:00:00Z' }), NOW, 'SOX_PM'))).toMatch(/not yet effective/);
    expect(blockedWhy(evaluateDatasetUsability(dataset({ verificationStatus: 'unverified', notice: null, effectiveFrom: '2027-01-01T00:00:00Z' }), NOW, 'SOX_PM'))).toMatch(/not yet effective/);
  });
  it('invalid date strings: blocked', () => {
    expect(blockedWhy(evaluateDatasetUsability(verified({ effectiveFrom: 'next year' }), NOW, 'SOX_PM'))).toMatch(/not valid/);
  });
  it('wrong category / null / empty geometry / bad now: blocked', () => {
    expect(blockedWhy(evaluateDatasetUsability(dataset({ emissionCategory: 'NOX' }), NOW, 'SOX_PM'))).toMatch(/NOX, not SOX_PM/);
    expect(blockedWhy(evaluateDatasetUsability(null, NOW, 'SOX_PM'))).toMatch(/No boundary dataset/);
    expect(blockedWhy(evaluateDatasetUsability(dataset({ polygons: [] }), NOW, 'SOX_PM'))).toMatch(/no polygons/);
    expect(blockedWhy(evaluateDatasetUsability(dataset(), 'now', 'SOX_PM'))).toMatch(/Current time/);
  });
  it('blocked results show "BOUNDARY DATA NOT USABLE", never a current-looking banner', () => {
    const u = evaluateDatasetUsability(dataset({ verificationStatus: 'expired' }), NOW, 'SOX_PM');
    expect(u.usable).toBe(false);
    if (!u.usable) expect(u.bannerText).toBe('BOUNDARY DATA NOT USABLE');
  });
});

describe('GeoJSON dataset parsing / validation', () => {
  const base = (over: Record<string, unknown> = {}, coords: unknown = [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]) => ({
    type: 'FeatureCollection',
    fuelswitch: {
      datasetId: 't', name: 't', emissionCategory: 'SOX_PM', verificationStatus: 'synthetic',
      notice: 'DEMO DATA — NOT FOR NAVIGATION OR REGULATORY COMPLIANCE', ...over,
    },
    features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: coords } }],
  });
  const errs = (r: ReturnType<typeof parseDatasetFromGeoJson>) => (r.ok ? [] : r.errors).join(' | ');

  it('bundled synthetic ECA parses; non-RFC-7946 winding is reported as a warning, not an error', () => {
    const { dataset: ds, warnings } = loadBundledSynthetic();
    expect(ds.verificationStatus).toBe('synthetic');
    expect(ds.emissionCategory).toBe('SOX_PM');
    expect(ds.polygons).toHaveLength(1);
    expect(warnings.join(' ')).toMatch(/winding/);
  });
  it('bundled route/ECA json is accepted by the same parser the app will use', () => {
    expect(parseDatasetFromGeoJson(readRepoJson('public/demo-data/synthetic-eca.geojson')).ok).toBe(true);
  });
  it('rejects an unclosed ring', () => expect(errs(parseDatasetFromGeoJson(base({}, [[[0, 0], [1, 0], [1, 1], [0, 1], [0.1, 0]]])))).toMatch(/not closed/));
  it('rejects out-of-range coordinates', () => expect(errs(parseDatasetFromGeoJson(base({}, [[[0, 0], [1, 0], [1, 95], [0, 1], [0, 0]]])))).toMatch(/invalid or out of range/));
  it('rejects self-intersecting (bow-tie) rings', () => expect(errs(parseDatasetFromGeoJson(base({}, [[[0, 0], [1, 1], [1, 0], [0, 1], [0, 0]]])))).toMatch(/self-intersects/));
  it('rejects rings that cross the antimeridian (unsupported, R-012)', () => {
    expect(errs(parseDatasetFromGeoJson(base({}, [[[179, 0], [-179, 0], [-179, 1], [179, 1], [179, 0]]])))).toMatch(/antimeridian/);
  });
  it('rejects too-short rings and zero-area rings', () => {
    expect(errs(parseDatasetFromGeoJson(base({}, [[[0, 0], [1, 0], [0, 0]]])))).toMatch(/at least 4/);
    expect(errs(parseDatasetFromGeoJson(base({}, [[[0, 0], [1, 0], [2, 0], [0, 0]]])))).toMatch(/zero area/);
  });
  it('non-synthetic datasets must record provenance (source name + URL)', () => {
    expect(errs(parseDatasetFromGeoJson(base({ verificationStatus: 'unverified' })))).toMatch(/provenance/);
    expect(parseDatasetFromGeoJson(base({ verificationStatus: 'unverified', sourceName: 'x', sourceUrl: 'https://example.invalid' })).ok).toBe(true);
  });
  it('synthetic datasets must carry the DEMO notice', () => expect(errs(parseDatasetFromGeoJson(base({ notice: '' })))).toMatch(/DEMO notice/));
  it('bad metadata and non-FeatureCollection input', () => {
    expect(errs(parseDatasetFromGeoJson(base({ emissionCategory: 'CO2' })))).toMatch(/emissionCategory/);
    expect(errs(parseDatasetFromGeoJson(base({ verificationStatus: 'probably-fine' })))).toMatch(/verificationStatus/);
    expect(errs(parseDatasetFromGeoJson({ type: 'Feature' }))).toMatch(/FeatureCollection/);
    expect(errs(parseDatasetFromGeoJson({ type: 'FeatureCollection', features: [] }))).toMatch(/fuelswitch/);
    expect(errs(parseDatasetFromGeoJson(null))).toMatch(/FeatureCollection/);
  });
  it('MultiPolygon with holes is supported', () => {
    const r = parseDatasetFromGeoJson({
      type: 'FeatureCollection',
      fuelswitch: { datasetId: 'm', name: 'm', emissionCategory: 'NOX', verificationStatus: 'synthetic', notice: 'DEMO DATA — NOT FOR NAVIGATION OR REGULATORY COMPLIANCE' },
      features: [{ type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: [
        [[[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]], [[1, 1], [1, 3], [3, 3], [3, 1], [1, 1]]],
        [[[10, 10], [12, 10], [12, 12], [10, 12], [10, 10]]],
      ] } }],
    });
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.dataset.polygons).toHaveLength(2); expect(r.dataset.polygons[0]?.rings).toHaveLength(2); }
  });
});

describe('SOx / NOx separation (FR-011)', () => {
  const noxDs = dataset({ emissionCategory: 'NOX' });
  const full = { engineCertification: { tier: 'unknown', certificateRef: 'free text', verified: false as const }, engineInstallationDateUtc: '2018-05-01T00:00:00Z' };
  it('missing certification / installation date → not-assessed, with reasons', () => {
    const a = assessNoxInputs({ engineCertification: null, engineInstallationDateUtc: null }, noxDs, NOW);
    expect(a.status).toBe('not-assessed');
    expect(a.reasons.join(' ')).toMatch(/No engine NOx certification/);
    expect(a.reasons.join(' ')).toMatch(/installation date unknown/);
  });
  it('a SOx dataset is never used as NOx data', () => {
    const a = assessNoxInputs(full, dataset({ emissionCategory: 'SOX_PM' }), NOW);
    expect(a.status).toBe('not-assessed');
    expect(a.reasons.join(' ')).toMatch(/not usable/);
  });
  it('even with every input present it only says "needs human review" — never compliant/applicable', () => {
    const a = assessNoxInputs(full, noxDs, NOW);
    expect(a.status).toBe('inputs-present-needs-human-review');
    expect(JSON.stringify(a)).not.toMatch(/\bcompliant\b|"applicable"|"not-applicable"/);
    expect(a.reasons.join(' ')).toMatch(/UNVERIFIED/);
  });
  it('always carries the SOx≠NOx disclaimer', () => {
    expect(assessNoxInputs(full, noxDs, NOW).disclaimer).toBe(NOX_DISCLAIMER);
    expect(NOX_DISCLAIMER).toMatch(/sulfur fuel changeover says nothing about NOx/);
  });
});
