// Units and time helpers. ALL unit conversions live here (docs/KOS/05-calculation-spec.md).
// 1 knot = 1 nautical mile per hour. 1 nautical mile = 1852 m (international). PROPOSED conventions, see KOS 05.

export const METERS_PER_NAUTICAL_MILE = 1852;
/** Mean Earth radius used by Turf's great-circle functions (spherical model). WGS84 difference not yet quantified (R-011). */
export const EARTH_RADIUS_METERS = 6_371_008.8;
export const MS_PER_MINUTE = 60_000;
export const MS_PER_HOUR = 3_600_000;

function assertFiniteNonNegative(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite number >= 0 (got ${String(value)})`);
  }
}

export function metersToNauticalMiles(meters: number): number {
  assertFiniteNonNegative(meters, 'meters');
  return meters / METERS_PER_NAUTICAL_MILE;
}

export function nauticalMilesToMeters(nauticalMiles: number): number {
  assertFiniteNonNegative(nauticalMiles, 'nauticalMiles');
  return nauticalMiles * METERS_PER_NAUTICAL_MILE;
}

export function metersPerSecondToKnots(metersPerSecond: number): number {
  assertFiniteNonNegative(metersPerSecond, 'metersPerSecond');
  return (metersPerSecond * 3600) / METERS_PER_NAUTICAL_MILE;
}

export function knotsToMetersPerSecond(knots: number): number {
  assertFiniteNonNegative(knots, 'knots');
  return (knots * METERS_PER_NAUTICAL_MILE) / 3600;
}

/** Hours needed to cover `distanceNm` at `speedKnots`. Throws unless speed > 0 — callers must validate first. */
export function hoursToCover(distanceNm: number, speedKnots: number): number {
  assertFiniteNonNegative(distanceNm, 'distanceNm');
  if (!Number.isFinite(speedKnots) || speedKnots <= 0) {
    throw new RangeError(`speedKnots must be a finite number > 0 (got ${String(speedKnots)})`);
  }
  return distanceNm / speedKnots;
}

/** Nautical miles covered in `minutes` at `speedKnots`. */
export function distanceCoveredNm(speedKnots: number, minutes: number): number {
  assertFiniteNonNegative(speedKnots, 'speedKnots');
  assertFiniteNonNegative(minutes, 'minutes');
  return (speedKnots * minutes) / 60;
}

export function hoursToMilliseconds(hours: number): number {
  assertFiniteNonNegative(hours, 'hours');
  return hours * MS_PER_HOUR;
}

const ISO_UTC = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/;

/** Parse a strict ISO-8601 UTC instant ("...Z" only). Returns epoch ms, or null if not valid.
 *  Rejects impossible calendar values (e.g. 2026-02-31) that Date.parse would silently roll over. */
export function parseIsoUtc(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const m = ISO_UTC.exec(value);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4], m[5], m[6]].map(Number) as [number, number, number, number, number, number];
  const ms = m[7] === undefined ? 0 : Number(m[7].padEnd(3, '0'));
  const epoch = Date.UTC(y, mo - 1, d, h, mi, s, ms);
  if (!Number.isFinite(epoch)) return null;
  const back = new Date(epoch);
  const roundTrips =
    back.getUTCFullYear() === y && back.getUTCMonth() === mo - 1 && back.getUTCDate() === d &&
    back.getUTCHours() === h && back.getUTCMinutes() === mi && back.getUTCSeconds() === s;
  return roundTrips ? epoch : null;
}

export function toIsoUtc(epochMs: number): string {
  if (!Number.isFinite(epochMs)) throw new RangeError('epochMs must be finite');
  return new Date(epochMs).toISOString();
}
