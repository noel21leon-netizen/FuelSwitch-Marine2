// Loads the BUNDLED synthetic dataset and route (public/demo-data). All data returned is synthetic and carries the DEMO notice.
// `fetchJson` is injected so tests need no network. Relative URLs keep sub-path hosting working (ADR-008).
import { buildRoute, parseDatasetFromGeoJson, type RegulatoryDataset, type Route } from '../../../domain';

export type FetchJson = (url: string) => Promise<unknown>;

export const DEMO_DATASET_PATH = 'demo-data/synthetic-eca.geojson';
export const DEMO_ROUTE_PATH = 'demo-data/synthetic-route.geojson';

export type LoadResult<T> =
  | { readonly ok: true; readonly value: T; readonly warnings: string[] }
  | { readonly ok: false; readonly errors: string[] };

export const browserFetchJson: FetchJson = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json() as Promise<unknown>;
};

export async function loadDemoDataset(fetchJson: FetchJson = browserFetchJson, baseUrl = './'): Promise<LoadResult<RegulatoryDataset>> {
  let json: unknown;
  try { json = await fetchJson(`${baseUrl}${DEMO_DATASET_PATH}`); }
  catch (e) { return { ok: false, errors: [`Could not load the bundled demo dataset: ${e instanceof Error ? e.message : String(e)}`] }; }
  const parsed = parseDatasetFromGeoJson(json);
  return parsed.ok ? { ok: true, value: parsed.dataset, warnings: parsed.warnings } : { ok: false, errors: parsed.errors };
}

export async function loadDemoRoute(fetchJson: FetchJson = browserFetchJson, baseUrl = './'): Promise<LoadResult<Route>> {
  let json: unknown;
  try { json = await fetchJson(`${baseUrl}${DEMO_ROUTE_PATH}`); }
  catch (e) { return { ok: false, errors: [`Could not load the bundled demo route: ${e instanceof Error ? e.message : String(e)}`] }; }

  const features = (json as { features?: unknown })?.features;
  const geom = Array.isArray(features) ? (features[0] as { geometry?: { type?: unknown; coordinates?: unknown } } | undefined)?.geometry : undefined;
  if (!geom || geom.type !== 'LineString' || !Array.isArray(geom.coordinates)) {
    return { ok: false, errors: ['Demo route must be a GeoJSON FeatureCollection whose first feature is a LineString.'] };
  }
  const built = buildRoute(geom.coordinates as number[][]);
  return built.ok ? { ok: true, value: built.route, warnings: [] } : { ok: false, errors: [built.explanation] };
}
