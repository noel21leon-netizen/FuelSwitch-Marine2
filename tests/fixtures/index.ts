// Deterministic fixtures. ALL data here is SYNTHETIC/SIMULATED test data — not any real ECA, route or vessel.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  buildRoute, parseDatasetFromGeoJson,
  type LonLat, type PolygonShape, type RegulatoryDataset, type Route, type VesselPosition,
} from '../../src/domain';

/** Independent hand constant: 1° of arc on a sphere of R = 6 371 008.8 m is 111 194.93 m = 60.0405 nm. */
export const NM_PER_DEGREE = 60.0405;

export const NOW = '2026-10-12T06:00:00Z';

export const ring = (pts: [number, number][]): LonLat[] => pts.map((p) => [p[0], p[1]] as LonLat);
export const poly = (...rings: [number, number][][]): PolygonShape => ({ rings: rings.map(ring) });

/** 1°×1° square on the equator: lon 0..1, lat -0.5..0.5 (counter-clockwise). */
export const SQUARE = poly([[0, -0.5], [1, -0.5], [1, 0.5], [0, 0.5], [0, -0.5]]);
/** Diamond touching lat 0.5 at a single vertex (0.5, 0.5). */
export const DIAMOND = poly([[0, 0], [0.5, 0.5], [1, 0], [0.5, -0.5], [0, 0]]);
/** U-shape (notch open to the north): a route along lat 2 crosses 4 times. */
export const U_SHAPE = poly([[0, 0], [3, 0], [3, 3], [2, 3], [2, 1], [1, 1], [1, 3], [0, 3], [0, 0]]);
/** Square with a square hole. */
export const HOLED = poly(
  [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]],
  [[1, 1], [1, 3], [3, 3], [3, 1], [1, 1]],
);

export function mustRoute(points: [number, number][]): Route {
  const r = buildRoute(points);
  if (!r.ok) throw new Error(`fixture route invalid: ${r.explanation}`);
  return r.route;
}

/** Straight west→east route along the equator, lon -2 → 2 (240.16 nm). Square entry at 2° (120.08 nm). RC-01. */
export const EQ_ROUTE = mustRoute([[-2, 0], [2, 0]]);
/** Dedicated CURVED route (RC-02): north, east, south, then east along the equator. ≈540 nm long, ≈300 nm start→end straight line. */
export const CURVED_ROUTE = mustRoute([[-3, 0], [-3, 2], [-1, 2], [-1, 0], [2, 0]]);
/** RC-05: same shape shifted 5° north — never reaches the square. */
export const MISSING_ROUTE = mustRoute([[-2, 5], [2, 5]]);

export function position(over: Partial<VesselPosition> = {}): VesselPosition {
  return {
    latitudeDeg: 0, longitudeDeg: -1, accuracyMeters: 10, observedAtUtc: NOW,
    source: 'simulator', sogKnots: 12, cogDegreesTrue: 90, isSimulated: true, ...over,
  };
}

export function dataset(over: Partial<RegulatoryDataset> = {}): RegulatoryDataset {
  return {
    datasetId: 'test-square', name: 'TEST SQUARE (synthetic)', emissionCategory: 'SOX_PM',
    sourceName: 'test', sourceUrl: '', datasetVersion: '0.0.0', effectiveFrom: null, effectiveTo: null,
    verificationStatus: 'synthetic', lastReviewedAtUtc: null,
    notice: 'DEMO DATA — NOT FOR NAVIGATION OR REGULATORY COMPLIANCE', polygons: [SQUARE], ...over,
  };
}

const here = dirname(fileURLToPath(import.meta.url));
export const readRepoJson = (rel: string): unknown => JSON.parse(readFileSync(join(here, '..', '..', rel), 'utf8'));

export function loadBundledSynthetic(): { dataset: RegulatoryDataset; route: Route; warnings: string[] } {
  const parsed = parseDatasetFromGeoJson(readRepoJson('public/demo-data/synthetic-eca.geojson'));
  if (!parsed.ok) throw new Error(parsed.errors.join('; '));
  const rj = readRepoJson('public/demo-data/synthetic-route.geojson') as { features: { geometry: { coordinates: number[][] } }[] };
  const coords = rj.features[0]?.geometry.coordinates;
  if (!coords) throw new Error('bundled route missing');
  return { dataset: parsed.dataset, route: mustRoute(coords as [number, number][]), warnings: parsed.warnings };
}
