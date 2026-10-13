// Spherical geodesy helpers (pure). Coordinates are [longitudeDeg, latitudeDeg] (GeoJSON order).
import { EARTH_RADIUS_METERS, metersToNauticalMiles } from '../units';

export type LonLat = readonly [number, number];

export function isValidLonLat(p: readonly number[] | null | undefined): p is LonLat {
  if (!p || p.length < 2) return false;
  const lon = p[0];
  const lat = p[1];
  return (
    typeof lon === 'number' && typeof lat === 'number' &&
    Number.isFinite(lon) && Number.isFinite(lat) &&
    lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90
  );
}

const rad = (d: number): number => (d * Math.PI) / 180;
const deg = (r: number): number => (r * 180) / Math.PI;

/** Great-circle (haversine) distance in nautical miles. */
export function haversineNm(a: LonLat, b: LonLat): number {
  const phi1 = rad(a[1]);
  const phi2 = rad(b[1]);
  const dPhi = phi2 - phi1;
  const dLambda = rad(b[0] - a[0]);
  const h = Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  const meters = 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
  return metersToNauticalMiles(meters);
}

/** Initial great-circle bearing a→b in degrees true, [0, 360). */
export function initialBearingDeg(a: LonLat, b: LonLat): number {
  const phi1 = rad(a[1]);
  const phi2 = rad(b[1]);
  const dLambda = rad(b[0] - a[0]);
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** Point reached from `start` after `distanceNm` along an initial bearing (great circle). */
export function destinationPoint(start: LonLat, bearingDegTrue: number, distanceNm: number): LonLat {
  if (!Number.isFinite(bearingDegTrue) || !Number.isFinite(distanceNm) || distanceNm < 0) {
    throw new RangeError('bearing must be finite and distance finite >= 0');
  }
  const delta = (distanceNm * 1852) / EARTH_RADIUS_METERS;
  const theta = rad(bearingDegTrue);
  const phi1 = rad(start[1]);
  const lambda1 = rad(start[0]);
  const sinPhi2 = Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta);
  const phi2 = Math.asin(Math.max(-1, Math.min(1, sinPhi2)));
  const lambda2 =
    lambda1 +
    Math.atan2(Math.sin(theta) * Math.sin(delta) * Math.cos(phi1), Math.cos(delta) - Math.sin(phi1) * sinPhi2);
  const lon = ((deg(lambda2) + 540) % 360) - 180;
  return [lon, deg(phi2)];
}
