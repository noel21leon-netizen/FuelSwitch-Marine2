// Regulatory/boundary dataset model, validation and usability rules (pure). KOS 07 "Status behaviour".
import { DEMO_BANNER_TEXT } from '../../shared/constants';
import { isValidLonLat, type LonLat } from '../geospatial/geo';
import { intersectSegments, type PolygonShape } from '../geospatial/polygon';
import { parseIsoUtc } from '../units';

export type VerificationStatus = 'synthetic' | 'unverified' | 'verified' | 'expired';
export type EmissionCategory = 'SOX_PM' | 'NOX';

export interface RegulatoryDataset {
  readonly datasetId: string;
  readonly name: string;
  readonly emissionCategory: EmissionCategory;
  readonly sourceName: string;
  readonly sourceUrl: string;
  readonly datasetVersion: string;
  readonly effectiveFrom: string | null;
  readonly effectiveTo: string | null;
  readonly verificationStatus: VerificationStatus;
  readonly lastReviewedAtUtc: string | null;
  readonly notice: string | null;
  readonly polygons: readonly PolygonShape[];
}

/** Machine-readable reason a dataset is blocked, so presenters never have to parse `reason` text (5C-2, ADR-037). */
export type DatasetBlockCode =
  | 'no-dataset' | 'wrong-category' | 'no-polygons' | 'invalid-now' | 'marked-expired'
  | 'invalid-dates' | 'not-yet-effective' | 'past-effective-to' | 'verified-incomplete';

export type DatasetUsability =
  | { readonly usable: true; readonly level: 'demo' | 'unverified' | 'verified'; readonly bannerText: string | null; readonly warnings: string[] }
  | { readonly usable: false; readonly level: 'blocked'; readonly code: DatasetBlockCode; readonly reason: string; readonly bannerText: string; readonly warnings: string[] };

/**
 * Decide whether a dataset may drive a calculation for `purpose` at `nowUtc`.
 *  synthetic  → allowed, DEMO banner     unverified → allowed with explicit warning
 *  verified   → allowed only inside effective dates (dates required)
 *  expired / not yet effective / wrong category / invalid dates / no geometry → blocked
 * Expired or unverified data is never presented as current.
 */
export function evaluateDatasetUsability(
  dataset: RegulatoryDataset | null | undefined,
  nowUtc: string,
  purpose: EmissionCategory,
): DatasetUsability {
  const blocked = (code: DatasetBlockCode, reason: string): DatasetUsability => ({
    usable: false, level: 'blocked', code, reason, bannerText: 'BOUNDARY DATA NOT USABLE', warnings: [],
  });
  if (!dataset) return blocked('no-dataset', 'No boundary dataset is loaded.');
  if (dataset.emissionCategory !== purpose) {
    return blocked('wrong-category', `Dataset "${dataset.name}" is for ${dataset.emissionCategory}, not ${purpose}.`);
  }
  if (dataset.polygons.length === 0) return blocked('no-polygons', 'Dataset contains no polygons.');
  const nowMs = parseIsoUtc(nowUtc);
  if (nowMs === null) return blocked('invalid-now', 'Current time is not a valid ISO UTC timestamp.');

  if (dataset.verificationStatus === 'expired') return blocked('marked-expired', `Dataset "${dataset.name}" is marked EXPIRED.`);

  const fromMs = dataset.effectiveFrom === null ? null : parseIsoUtc(dataset.effectiveFrom);
  const toMs = dataset.effectiveTo === null ? null : parseIsoUtc(dataset.effectiveTo);
  if ((dataset.effectiveFrom !== null && fromMs === null) || (dataset.effectiveTo !== null && toMs === null)) {
    return blocked('invalid-dates', 'Dataset effective dates are not valid ISO UTC timestamps.');
  }

  if (dataset.verificationStatus === 'synthetic') {
    return { usable: true, level: 'demo', bannerText: dataset.notice ?? DEMO_BANNER_TEXT, warnings: [] };
  }

  // unverified / verified: effective dates are enforced.
  if (fromMs !== null && nowMs < fromMs) return blocked('not-yet-effective', `Dataset "${dataset.name}" is not yet effective.`);
  if (toMs !== null && nowMs > toMs) return blocked('past-effective-to', `Dataset "${dataset.name}" has expired (effective to ${dataset.effectiveTo}).`);

  if (dataset.verificationStatus === 'verified') {
    if (fromMs === null || dataset.lastReviewedAtUtc === null) {
      return blocked('verified-incomplete', 'A verified dataset must have an effective-from date and a review timestamp.');
    }
    // effectiveTo === null means "no end date recorded", NOT "valid forever" — surface it.
    const warnings = toMs === null ? ['No effective-to date is recorded; confirm the dataset is still in force.'] : [];
    return { usable: true, level: 'verified', bannerText: null, warnings };
  }

  return {
    usable: true, level: 'unverified', bannerText: 'UNVERIFIED BOUNDARY — NOT FOR NAVIGATION OR REGULATORY COMPLIANCE',
    warnings: ['Boundary data is UNVERIFIED. Results must not be relied on.'],
  };
}

// ---------- GeoJSON parsing + validation ----------

export type DatasetParseResult =
  | { readonly ok: true; readonly dataset: RegulatoryDataset; readonly warnings: string[] }
  | { readonly ok: false; readonly errors: string[] };

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);

/** Signed area (planar, lon/lat). >0 counter-clockwise. */
export function signedRingArea(ring: readonly LonLat[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i];
    const b = ring[i + 1];
    if (a && b) sum += a[0] * b[1] - b[0] * a[1];
  }
  return sum / 2;
}

function ringSelfIntersects(ring: readonly LonLat[]): boolean {
  const n = ring.length - 1;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue; // adjacent edges share a vertex
      const a = ring[i]; const a2 = ring[i + 1]; const b = ring[j]; const b2 = ring[j + 1];
      if (a && a2 && b && b2 && intersectSegments(a, a2, b, b2) !== null) return true;
    }
  }
  return false;
}

function parseRing(raw: unknown, label: string, errors: string[]): LonLat[] | null {
  if (!Array.isArray(raw) || raw.length < 4) {
    errors.push(`${label}: a ring needs at least 4 positions.`);
    return null;
  }
  const ring: LonLat[] = [];
  for (let i = 0; i < raw.length; i++) {
    const p: unknown = raw[i];
    if (!Array.isArray(p) || !isValidLonLat(p as number[])) {
      errors.push(`${label}: position ${i + 1} is invalid or out of range (lon ±180, lat ±90).`);
      return null;
    }
    ring.push([(p as number[])[0] as number, (p as number[])[1] as number]);
  }
  const first = ring[0]; const last = ring[ring.length - 1];
  if (!first || !last || first[0] !== last[0] || first[1] !== last[1]) {
    errors.push(`${label}: ring is not closed (first and last positions differ).`);
    return null;
  }
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1]; const b = ring[i];
    if (a && b && Math.abs(b[0] - a[0]) > 180) {
      errors.push(`${label}: antimeridian crossing is not supported yet (R-012).`);
      return null;
    }
  }
  if (ringSelfIntersects(ring)) { errors.push(`${label}: ring self-intersects.`); return null; }
  if (Math.abs(signedRingArea(ring)) === 0) { errors.push(`${label}: ring has zero area.`); return null; }
  return ring;
}

/** Parse + validate a FeatureCollection with a `fuelswitch` metadata member (KOS 07). Never accepts silently-bad geometry. */
export function parseDatasetFromGeoJson(json: unknown): DatasetParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isObj(json) || json['type'] !== 'FeatureCollection' || !Array.isArray(json['features'])) {
    return { ok: false, errors: ['Not a GeoJSON FeatureCollection.'] };
  }
  const meta = json['fuelswitch'];
  if (!isObj(meta)) return { ok: false, errors: ['Missing "fuelswitch" dataset metadata member.'] };

  const category = meta['emissionCategory'];
  if (category !== 'SOX_PM' && category !== 'NOX') errors.push('emissionCategory must be "SOX_PM" or "NOX".');
  const status = meta['verificationStatus'];
  if (status !== 'synthetic' && status !== 'unverified' && status !== 'verified' && status !== 'expired') {
    errors.push('verificationStatus must be synthetic, unverified, verified or expired.');
  }
  if (typeof meta['datasetId'] !== 'string' || meta['datasetId'] === '') errors.push('datasetId is required.');
  if (status !== 'synthetic' && (str(meta['sourceName']) === '' || str(meta['sourceUrl']) === '')) {
    errors.push('Non-synthetic datasets must record sourceName and sourceUrl (provenance).');
  }
  if (status === 'synthetic' && str(meta['notice']) === '') errors.push('Synthetic datasets must carry the DEMO notice.');

  const polygons: PolygonShape[] = [];
  (json['features'] as unknown[]).forEach((f, fi) => {
    const geom = isObj(f) ? f['geometry'] : null;
    if (!isObj(geom)) { errors.push(`Feature ${fi + 1}: missing geometry.`); return; }
    const coordsList: unknown[] =
      geom['type'] === 'Polygon' ? [geom['coordinates']] : geom['type'] === 'MultiPolygon' && Array.isArray(geom['coordinates']) ? (geom['coordinates'] as unknown[]) : [];
    if (coordsList.length === 0) { errors.push(`Feature ${fi + 1}: only Polygon and MultiPolygon are supported.`); return; }
    coordsList.forEach((polyCoords, pi) => {
      if (!Array.isArray(polyCoords) || polyCoords.length === 0) { errors.push(`Feature ${fi + 1}.${pi + 1}: empty polygon.`); return; }
      const rings: LonLat[][] = [];
      polyCoords.forEach((r: unknown, ri: number) => {
        const ring = parseRing(r, `Feature ${fi + 1}.${pi + 1} ring ${ri + 1}`, errors);
        if (ring) {
          rings.push(ring);
          const ccw = signedRingArea(ring) > 0;
          if ((ri === 0 && !ccw) || (ri > 0 && ccw)) {
            warnings.push(`Feature ${fi + 1}.${pi + 1} ring ${ri + 1}: winding differs from RFC 7946 right-hand rule (accepted; results are winding-independent).`);
          }
        }
      });
      if (rings.length === polyCoords.length) polygons.push({ rings });
    });
  });
  if (polygons.length === 0 && errors.length === 0) errors.push('No polygons found.');
  if (errors.length > 0) return { ok: false, errors };

  const dataset: RegulatoryDataset = {
    datasetId: str(meta['datasetId']),
    name: str(meta['name'], 'Unnamed dataset'),
    emissionCategory: category as EmissionCategory,
    sourceName: str(meta['sourceName']),
    sourceUrl: str(meta['sourceUrl']),
    datasetVersion: str(meta['datasetVersion'], 'unknown'),
    effectiveFrom: typeof meta['effectiveFrom'] === 'string' ? meta['effectiveFrom'] : null,
    effectiveTo: typeof meta['effectiveTo'] === 'string' ? meta['effectiveTo'] : null,
    verificationStatus: status as VerificationStatus,
    lastReviewedAtUtc: typeof meta['lastReviewedAtUtc'] === 'string' ? meta['lastReviewedAtUtc'] : null,
    notice: typeof meta['notice'] === 'string' && meta['notice'] !== '' ? meta['notice'] : null,
    polygons,
  };
  return { ok: true, dataset, warnings };
}
