// Dataset variants for the e2e dataset-status tests. Served in place of public/demo-data/synthetic-eca.geojson via page.route().
// They are TEST FILES with the same fictional open-ocean polygon as the demo dataset: none is a real boundary, and `sourceName`
// / `sourceUrl` exist only to satisfy the parser's provenance rule for non-synthetic datasets.
// Expected status labels were checked against the real parser and presenter (describeDatasetStatus) at E2E_START_UTC
// (see docs/KOS/11-release-readiness.md, chunk 6); they are restated, not computed, in the specs.

export const E2E_START_UTC = '2026-10-12T00:00:00.000Z';

const POLYGON = [[[-20.0, -6.0], [-17.0, -7.0], [-16.5, -10.5], [-19.5, -11.0], [-20.0, -6.0]]];

export type DatasetVariantName = 'synthetic' | 'unverified' | 'expired-flag' | 'expired-date';

interface Meta { [key: string]: string | null }

function build(meta: Meta): unknown {
  return {
    type: 'FeatureCollection',
    fuelswitch: {
      datasetId: 'e2e-test-dataset',
      emissionCategory: 'SOX_PM',
      sourceName: 'E2E test file (fictional, not a real boundary)',
      sourceUrl: 'https://example.invalid/e2e-test-file',
      datasetVersion: 'e2e-0.0.1',
      effectiveFrom: null,
      effectiveTo: null,
      lastReviewedAtUtc: null,
      notice: 'DEMO DATA — NOT FOR NAVIGATION OR REGULATORY COMPLIANCE',
      ...meta,
    },
    features: [{ type: 'Feature', properties: { id: 'e2e-1', name: 'E2E test polygon', synthetic: true }, geometry: { type: 'Polygon', coordinates: POLYGON } }],
  };
}

export const DATASET_VARIANTS: Record<Exclude<DatasetVariantName, 'synthetic'>, { readonly name: string; readonly json: unknown }> = {
  // Declared unverified: usable, but must be labelled UNVERIFIED with a warning; the ETA still works.
  unverified: { name: 'E2E UNVERIFIED test file', json: build({ name: 'E2E UNVERIFIED test file', verificationStatus: 'unverified' }) },
  // Declared expired: blocked, not used for calculations.
  'expired-flag': { name: 'E2E EXPIRED-by-flag test file', json: build({ name: 'E2E EXPIRED-by-flag test file', verificationStatus: 'expired' }) },
  // Declared verified, but its effective-to date is before E2E_START_UTC: blocked as EXPIRED by the date rule.
  'expired-date': {
    name: 'E2E EXPIRED-by-date test file',
    json: build({
      name: 'E2E EXPIRED-by-date test file', verificationStatus: 'verified',
      effectiveFrom: '2025-01-01T00:00:00Z', effectiveTo: '2026-01-01T00:00:00Z', lastReviewedAtUtc: '2025-06-01T00:00:00Z',
    }),
  },
};
