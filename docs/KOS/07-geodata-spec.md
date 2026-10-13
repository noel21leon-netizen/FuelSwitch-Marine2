# 07 — Geodata Specification

Status: PROPOSED. Basemap appearance is never a source of an ECA boundary.

## Dataset record (JSON foreign member `fuelswitch` on a GeoJSON FeatureCollection)
| Field | Type | Notes |
|---|---|---|
| datasetId | string | stable id |
| name | string | human name; synthetic sets must say so |
| emissionCategory | `SOX_PM` \| `NOX` | separate records per category |
| sourceName / sourceUrl | string | primary source; empty only for synthetic |
| datasetVersion | string | semantic or publication version |
| effectiveFrom / effectiveTo | ISO UTC \| null | null = unknown; unknown ≠ forever |
| verificationStatus | `synthetic` \| `unverified` \| `verified` \| `expired` | drives UI behaviour |
| lastReviewedAtUtc | ISO UTC \| null | |
| notice | string | required banner text for synthetic data |

## Status behaviour (app rule)
| Status | Calculation | UI |
|---|---|---|
| synthetic | allowed | DEMO banner on every screen using it |
| unverified | allowed only with explicit warning | "UNVERIFIED BOUNDARY" banner |
| verified | allowed if inside effective dates | shows source, version, reviewed date |
| expired / not yet effective / missing dates for verified | blocked for ETA | "boundary data not usable" with reason |

## Validation checklist (before any non-synthetic dataset is accepted)
Closed rings · valid coordinate ranges (lat ±90, lon ±180) · no self-intersection · consistent winding · antimeridian handling decided and tested (R-012)
· provenance and licence recorded in 06 · effective dates present · regression tests added.

## Bundled data (all SIMULATED/synthetic)
- `public/demo-data/synthetic-eca.geojson` — fictional quadrilateral in open ocean (not any real ECA).
- `public/demo-data/synthetic-route.geojson` — 4-waypoint route crossing it west→east.
Both carry `verificationStatus: "synthetic"` and the DEMO notice.

## Update workflow (future)
Obtain primary source → record in 06 → convert → validate checklist → set `unverified` → human review → `verified` with reviewer + date → regression tests → CHANGELOG + ADR.

## Dataset status presentation (5C-2, ADR-037)
Shown on the More tab and as a one-line status on the Dashboard "Next boundary" row. Produced by the pure `describeDatasetStatus`, which reuses the usability rules above; nothing is re-implemented in the UI.
| Situation | Label shown | Used for calculation | Notice |
|---|---|---|---|
| synthetic | SYNTHETIC | yes | DEMO banner text |
| unverified, inside dates | UNVERIFIED | yes | "UNVERIFIED BOUNDARY — NOT FOR NAVIGATION OR REGULATORY COMPLIANCE" |
| verified, inside dates | VERIFIED | yes | none; warning if no `effectiveTo` is recorded |
| marked expired, or now > `effectiveTo` (any declared status) | EXPIRED | **no** | block notice with the domain reason |
| now < `effectiveFrom` | NOT YET EFFECTIVE | **no** | block notice |
| wrong category, no polygons, bad dates/clock, verified without review stamp | NOT USABLE | **no** | block notice |
| nothing loaded | UNAVAILABLE | **no** | block notice |
Also shown whatever the status: source (blank or `unknown` → **UNKNOWN** + warning), dataset version (unrecorded → UNKNOWN), declared status, effective from/to, last reviewed, and the time and clock the assessment used. The label is metadata-based: the app cannot verify a boundary.

## Precache scope (5C-2, ADR-039)
The service worker precaches the app shell and the bundled demo data (`geojson` is in `globPatterns`). It has no runtime caching, so no dataset can be served from a runtime cache and map tiles are never cached. A cached build serves its bundled dataset until the user applies an update (R-036); the status presenter judges it by its own dates.
