// Boundary approach + ETA (pure). KOS 05 "Time to crossing" and "Boundary crossing detection".
// Distance is measured ALONG THE ROUTE (or along the assumed-course ray in course-projection mode), never straight-line.
import { destinationPoint, type LonLat } from '../geospatial/geo';
import { findRouteCrossings, type CrossingCandidate } from '../geospatial/crossings';
import { pointInAnyPolygon, type PolygonShape } from '../geospatial/polygon';
import { buildRoute, type Route } from '../geospatial/route';
import { projectWithContinuity, type ProgressHint } from '../geospatial/continuity';
import { assessPosition, validateSog, type PositionRejectReason, type VesselPosition } from '../position/position';
import { evaluateDatasetUsability, type RegulatoryDataset } from '../regulations/dataset';
import { DEFAULT_DOMAIN_SETTINGS, type DomainSettings } from '../config';
import { hoursToCover, hoursToMilliseconds, parseIsoUtc, toIsoUtc } from '../units';

export type EtaMode = 'route' | 'course-projection';

export type EtaUnavailableReason =
  | PositionRejectReason
  | 'sog-missing' | 'sog-zero-or-implausible' | 'cog-missing'
  | 'no-route' | 'no-crossing-found' | 'projection-misses-boundary'
  | 'already-inside' | 'ambiguous-geometry' | 'dataset-not-usable'
  | 'duration-missing' | 'margin-missing' | 'start-overdue';

export interface Unavailable {
  readonly status: 'unavailable';
  readonly reason: EtaUnavailableReason;
  readonly explanation: string;
}

export interface ApproachAvailable {
  readonly status: 'available';
  readonly mode: EtaMode;
  /** The path distances are measured along (the selected route, or the assumed-course ray). */
  readonly path: Route;
  readonly position: VesselPosition;
  readonly vesselAlongPathNm: number;
  readonly offRouteNm: number;
  readonly crossing: CrossingCandidate;
  readonly remainingDistanceNm: number;
  readonly warnings: string[];
  readonly assumptions: string[];
  /** Labels the UI must show (SIMULATED position, DEMO/UNVERIFIED boundary). */
  readonly labels: string[];
}
export type ApproachResult = ApproachAvailable | Unavailable;

export interface EtaAvailable {
  readonly status: 'available';
  readonly mode: EtaMode;
  readonly timeToCrossingHours: number;
  /** Fix time + remaining/SOG. Anchored to the fix timestamp, not to "now". */
  readonly crossingAtUtc: string;
  readonly remainingDistanceNm: number;
  readonly crossingPointLonLatDeg: LonLat;
  readonly crossingRouteDistanceNm: number;
  readonly vesselAlongPathNm: number;
  readonly offRouteNm: number;
  readonly sogKnots: number;
  readonly path: Route;
  readonly warnings: string[];
  readonly assumptions: string[];
  readonly labels: string[];
}
export type EtaResult = EtaAvailable | Unavailable;

const unavailable = (reason: EtaUnavailableReason, explanation: string): Unavailable => ({ status: 'unavailable', reason, explanation });

export interface RouteApproachInput {
  readonly position: VesselPosition | null | undefined;
  readonly route: Route | null | undefined;
  readonly dataset: RegulatoryDataset | null | undefined;
  readonly nowUtc: string;
  readonly settings?: DomainSettings;
  /** Optional previous along-route progress (R-019). When given, projection is restricted to a window around it. */
  readonly progressHint?: ProgressHint | null;
}

interface Gate {
  readonly position: VesselPosition;
  readonly polygons: readonly PolygonShape[];
  readonly warnings: string[];
  readonly labels: string[];
}

function gate(input: Pick<RouteApproachInput, 'position' | 'dataset' | 'nowUtc'>, settings: DomainSettings): Gate | Unavailable {
  const pos = assessPosition(input.position, input.nowUtc, settings);
  if (!pos.ok) return unavailable(pos.reason, pos.explanation);
  const usability = evaluateDatasetUsability(input.dataset, input.nowUtc, 'SOX_PM');
  if (!usability.usable) return unavailable('dataset-not-usable', usability.reason);
  const labels: string[] = [];
  if (pos.position.isSimulated) labels.push('SIMULATED');
  if (usability.bannerText) labels.push(usability.bannerText);
  return {
    position: pos.position,
    polygons: (input.dataset as RegulatoryDataset).polygons,
    warnings: [...pos.warnings, ...usability.warnings],
    labels,
  };
}

function selectEntry(
  path: Route, polygons: readonly PolygonShape[], alongNm: number, mode: EtaMode,
): { crossing: CrossingCandidate; warnings: string[] } | Unavailable {
  const all = findRouteCrossings(path, polygons);
  const ahead = all.filter((c) => c.routeDistanceFromStartNm > alongNm + 1e-9);
  const warnings: string[] = [];
  const noneReason: EtaUnavailableReason = mode === 'route' ? 'no-crossing-found' : 'projection-misses-boundary';

  const firstEntering = ahead.find((c) => c.direction === 'entering');
  const firstAmbiguous = ahead.find((c) => c.direction === 'ambiguous');
  const firstSignificant = ahead.find((c) => c.direction !== 'grazing');

  if (firstAmbiguous && (!firstEntering || firstAmbiguous.routeDistanceFromStartNm < firstEntering.routeDistanceFromStartNm)) {
    return unavailable('ambiguous-geometry', 'The path runs along or ends on a boundary edge; the crossing cannot be determined reliably.');
  }
  if (firstSignificant && firstSignificant.direction === 'exiting') {
    return unavailable('ambiguous-geometry', 'The next boundary crossing ahead is an EXIT although the vessel is outside the area; position and route disagree.');
  }
  if (!firstEntering) {
    const grazes = ahead.filter((c) => c.direction === 'grazing').length;
    const base = mode === 'route' ? 'The route does not enter the area ahead of the vessel.' : 'The assumed course does not reach the area within the projection horizon.';
    return unavailable(noneReason, grazes > 0 ? `${base} (${grazes} boundary touch-point(s) ignored.)` : base);
  }
  for (const c of ahead) {
    if (c === firstEntering) continue;
    if (c.direction === 'grazing') warnings.push(`Route touches the boundary (graze) ${c.routeDistanceFromStartNm.toFixed(1)} nm from route start; not treated as entry.`);
  }
  const laterEntries = ahead.filter((c) => c.direction === 'entering' && c !== firstEntering).length;
  if (laterEntries > 0) warnings.push(`${laterEntries} further entering crossing(s) later on the path; the NEXT entering crossing is used.`);
  return { crossing: firstEntering, warnings };
}

/** Where is the next boundary entry along the selected route, and how far? Does not need SOG. */
export function analyzeRouteApproach(input: RouteApproachInput): ApproachResult {
  const settings = input.settings ?? DEFAULT_DOMAIN_SETTINGS;
  const g = gate(input, settings);
  if ('status' in g) return g;
  if (!input.route) return unavailable('no-route', 'No route is selected.');

  const here: LonLat = [g.position.longitudeDeg, g.position.latitudeDeg];
  if (pointInAnyPolygon(here, g.polygons)) {
    return unavailable('already-inside', 'The vessel is already inside the area; there is no entry to predict.');
  }
  const proj = projectWithContinuity(input.route, here, input.progressHint, { offRouteToleranceNm: settings.offRouteToleranceNm });
  const sel = selectEntry(input.route, g.polygons, proj.alongRouteNm, 'route');
  if ('status' in sel) return sel;

  const warnings = [...g.warnings, ...sel.warnings];
  if (proj.method === 'global-fallback') {
    warnings.push('Route progress could not be tracked continuously; the nearest point on the whole route was used and may be on a different leg.');
  }
  if (proj.offRouteNm > settings.offRouteToleranceNm) {
    warnings.push(`Vessel is ${proj.offRouteNm.toFixed(1)} nm off the route (tolerance ${settings.offRouteToleranceNm} nm): lower confidence; distances are measured from the nearest point on the route.`);
  }
  return {
    status: 'available', mode: 'route', path: input.route, position: g.position,
    vesselAlongPathNm: proj.alongRouteNm, offRouteNm: proj.offRouteNm,
    crossing: sel.crossing,
    remainingDistanceNm: sel.crossing.routeDistanceFromStartNm - proj.alongRouteNm,
    warnings,
    assumptions: ['Distance is measured along the selected route from the vessel\'s nearest point on it.'],
    labels: g.labels,
  };
}

/** Course-projection mode: assumes current COURSE and SPEED continue. Always labelled as such. */
export function analyzeCourseProjection(input: Omit<RouteApproachInput, 'route'>): ApproachResult {
  const settings = input.settings ?? DEFAULT_DOMAIN_SETTINGS;
  const g = gate(input, settings);
  if ('status' in g) return g;
  const cog = g.position.cogDegreesTrue;
  if (cog === null || !Number.isFinite(cog)) return unavailable('cog-missing', 'Course over ground is not available, so a course projection cannot be made.');
  const here: LonLat = [g.position.longitudeDeg, g.position.latitudeDeg];
  if (pointInAnyPolygon(here, g.polygons)) return unavailable('already-inside', 'The vessel is already inside the area; there is no entry to predict.');

  const horizon = settings.courseProjectionHorizonNm;
  const step = 1;
  const pts: LonLat[] = [here];
  for (let d = step; d < horizon; d += step) pts.push(destinationPoint(here, cog, d));
  pts.push(destinationPoint(here, cog, horizon));
  const built = buildRoute(pts);
  if (!built.ok) return unavailable('projection-misses-boundary', built.explanation);

  const sel = selectEntry(built.route, g.polygons, 0, 'course-projection');
  if ('status' in sel) return sel;
  return {
    status: 'available', mode: 'course-projection', path: built.route, position: g.position,
    vesselAlongPathNm: 0, offRouteNm: 0, crossing: sel.crossing,
    remainingDistanceNm: sel.crossing.routeDistanceFromStartNm,
    warnings: [...g.warnings, ...sel.warnings],
    assumptions: ['COURSE PROJECTION: assumes the current course and speed continue unchanged. Not a route-based prediction.'],
    labels: g.labels,
  };
}

/** Turn an approach into an ETA. Needs plausible SOG; never returns ∞, 0 or a guess. */
export function computeEta(approach: ApproachResult, settings: DomainSettings = DEFAULT_DOMAIN_SETTINGS): EtaResult {
  if (approach.status === 'unavailable') return approach;
  const sog = validateSog(approach.position.sogKnots, settings.plausibleSogKnots);
  if (!sog.ok) return unavailable(sog.reason, sog.explanation);
  const fixMs = parseIsoUtc(approach.position.observedAtUtc);
  if (fixMs === null) return unavailable('invalid-timestamp', 'Fix timestamp is not valid ISO UTC.');

  const hours = hoursToCover(approach.remainingDistanceNm, sog.sogKnots);
  return {
    status: 'available', mode: approach.mode,
    timeToCrossingHours: hours,
    crossingAtUtc: toIsoUtc(fixMs + hoursToMilliseconds(hours)),
    remainingDistanceNm: approach.remainingDistanceNm,
    crossingPointLonLatDeg: approach.crossing.pointLonLatDeg,
    crossingRouteDistanceNm: approach.crossing.routeDistanceFromStartNm,
    vesselAlongPathNm: approach.vesselAlongPathNm,
    offRouteNm: approach.offRouteNm,
    sogKnots: sog.sogKnots,
    path: approach.path,
    warnings: approach.warnings,
    assumptions: [...approach.assumptions, `SOG ${sog.sogKnots.toFixed(1)} kn is assumed constant; crossing time is anchored to the fix timestamp.`],
    labels: approach.labels,
  };
}

export function computeRouteEta(input: RouteApproachInput): EtaResult {
  return computeEta(analyzeRouteApproach(input), input.settings ?? DEFAULT_DOMAIN_SETTINGS);
}

export function computeCourseProjectionEta(input: Omit<RouteApproachInput, 'route'>): EtaResult {
  return computeEta(analyzeCourseProjection(input), input.settings ?? DEFAULT_DOMAIN_SETTINGS);
}
