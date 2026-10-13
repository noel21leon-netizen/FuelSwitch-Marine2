# 04 — Domain Model

Status: PROPOSED. Units are in field names. Timestamps are ISO 8601 UTC strings. No unit-less numbers.

## From the owner baseline
```ts
type PositionSource = "browser-gps" | "onboard-feed" | "manual" | "simulator";
interface VesselPosition {
  latitudeDeg: number; longitudeDeg: number; accuracyMeters: number | null;
  observedAtUtc: string; source: PositionSource;
  sogKnots: number | null; cogDegreesTrue: number | null; isSimulated: boolean;
}
interface EcaBoundaryDataset {
  id: string; name: string; emissionCategory: "SOX_PM" | "NOX"; geometryGeoJson: unknown;
  sourceName: string; sourceUrl: string; datasetVersion: string;
  effectiveFrom: string | null; effectiveTo: string | null;
  verificationStatus: "synthetic" | "unverified" | "verified" | "expired";
  lastReviewedAtUtc: string | null;
}
type DurationMethod = "manual-verified" | "validated-engine";
interface ChangeoverPlanInput { crossingAtUtc: string; remainingRouteDistanceNm: number; sogKnots: number;
  changeoverDurationMinutes: number; safetyMarginMinutes: number; durationMethod: DurationMethod; }
interface ChangeoverPlan { plannedStartAtUtc: string; predictedCrossingAtUtc: string; plannedStartDistanceNm: number;
  durationMethod: DurationMethod; assumptions: string[]; warnings: string[]; }
```
Implementation note: use real GeoJSON types (`geojson` types via Turf) instead of `unknown`.

## Proposed additions (PROPOSED)
```ts
type CrossingDirection = "entering" | "exiting" | "grazing" | "ambiguous";
interface CrossingCandidate { pointLonLatDeg: [number, number]; routeDistanceFromStartNm: number; direction: CrossingDirection; }

type EtaUnavailableReason =
  | "no-position" | "stale-fix" | "invalid-coordinates" | "poor-accuracy"
  | "sog-missing" | "sog-zero-or-implausible" | "no-route" | "no-crossing-found"
  | "projection-misses-boundary" | "already-inside" | "ambiguous-geometry"
  | "dataset-not-usable" | "duration-missing" | "start-overdue";
type EtaResult =
  | { status: "available"; mode: "route" | "course-projection"; timeToCrossingHours: number; crossingAtUtc: string;
      remainingDistanceNm: number; warnings: string[]; assumptions: string[] }
  | { status: "unavailable"; reason: EtaUnavailableReason; explanation: string };

interface Settings { staleAfterSeconds: number; maxAccuracyMeters: number; safetyMarginMinutes: number;
  changeoverDurationMinutes: number | null; durationSource: "manual-verified" | "none";
  alertThresholdsMinutesBeforeStart: number[]; }
interface VesselProfile { name: string; imoNumber: string | null; /* free text, unverified */
  noxEngineCertification: null | { tier: string; certificateRef: string; verified: false }; }

interface ChangeoverLogEntry {
  id: string; createdAtUtc: string; dataStatus: "synthetic" | "simulated" | "live-unverified";
  plannedStartAtUtc: string | null; predictedCrossingAtUtc: string | null;
  confirmedStartAtUtc: string | null;       // human-entered only
  confirmedCompletionAtUtc: string | null;  // human-entered only; never inferred from GPS
  coordinatesAtStart: { latitudeDeg: number; longitudeDeg: number } | null;
  durationMinutes: number | null; durationSource: DurationMethod | "none"; marginMinutes: number | null;
  acknowledgments: string[]; overrides: string[]; notes: string;
}
```
NOx is a separate record family (vessel/engine certification + effective dates); it is never derived from SOx changeover data (FR-011).

## Implemented in chunk 2 — deviations from the proposed model above (all PROPOSED)
- `EtaUnavailableReason` extended with: `invalid-timestamp`, `cog-missing`, `margin-missing` (no silent default margin — KOS 05).
- `Settings.safetyMarginMinutes` is `number | null` in the planner API (null = not set by the user ⇒ `margin-missing`).
- `ChangeoverCalculator` port: `{ method; calculate(context?) → {ok, minutes, method, label} | {ok:false, reason:'duration-missing'} }`. Only `ManualVerifiedDurationCalculator` exists. `validated-engine` has **no implementation** (FOBAS method UNKNOWN).
- `EtaResult.available` also carries `crossingPointLonLatDeg`, `crossingRouteDistanceNm`, `vesselAlongPathNm`, `offRouteNm`, `sogKnots`, `path`, and `labels` (SIMULATED / DEMO / UNVERIFIED banners the UI must show).
- Two-step API: `analyzeRouteApproach` (distance to next entry; **no SOG needed**) → `computeEta` (needs plausible SOG). Dashboard can therefore show distance even when SOG is unavailable.
- `start-overdue` is returned as `unavailable` **with `details`** (planned start + minutes overdue) so the information is not hidden.
- Own minimal geometry types (`LonLat`, `PolygonShape`, `Route`) instead of Turf/GeoJSON types — keeps `src/domain` dependency-free (ADR-016).
- Dataset record gained `notice` and `polygons`; `parseDatasetFromGeoJson` validates before any dataset is accepted.
- NOx: `assessNoxInputs` returns only `not-assessed` or `inputs-present-needs-human-review`. It never returns compliant / applicable / not-applicable.

## Changeover log (chunk 5A)
- `ChangeoverLogEntry` (schemaVersion 1): `id`, `createdAtUtc`, `positionSource` (`simulator` | `browser-gps` | `unavailable`), derived-consistent `isSimulated`, `dataset` snapshot (name/version/verificationStatus), `plan` snapshot (planned start, predicted crossing, planned start point, duration + method + label, margin — each nullable), `actualStart` / `actualCompletion` (`HumanEvent`: `eventAtUtc` stated by the person, `confirmedAtUtc`, optional position), `acknowledgments`, `overrides`, `notes`.
- States: `planned` → `started` → `completed`, changed only by `confirmStart` / `confirmCompletion`. Nothing is inferred from GPS or from the planned time.
- `actualDurationMinutes` = human completion − human start; labelled human-entered; null unless both exist.
- `parseLogEntry` is the defensive reader for stored data (rejects wrong schema version, a simulated flag inconsistent with the source, malformed event times).
