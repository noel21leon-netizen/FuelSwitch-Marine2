# 05 — Calculation Specification

**No unsupported formula is permitted here.** FOBAS-compatible calculation = **UNKNOWN** (no authorised method or benchmark cases).
The prototype takes a **manually verified duration** and labels it as such everywhere. It is never called a FOBAS result.

## Conventions (PROPOSED — add citations in 06 before treating as VERIFIED)
- 1 knot = 1 nautical mile per hour; 1 nm = 1852 m (international nautical mile). Convert units only in `domain/eta/units`.
- Great-circle distance via Turf (spherical Earth). Difference to WGS84 geodesic is not yet quantified: **UNKNOWN**; record in R-011.
- All instants are ISO UTC. Validate before arithmetic; reject NaN/Infinity/out-of-range.

## Time to crossing
`timeToCrossingHours = remainingRouteDistanceNm / sogKnots`, only when remaining distance is measured **along the selected route**
and SOG is plausible. Milliseconds only at the application boundary. SOG missing / zero / implausible / stale → ETA unavailable (never ∞, 0 or a guess).

## Planned changeover start
`plannedStartAtUtc = predictedCrossingAtUtc − changeoverDurationMinutes − safetyMarginMinutes`
Duration source is shown in UI, logs and exports. Duration missing or not manually verified → planner unavailable (`duration-missing`).

## Planned start point
`plannedStartDistanceNm = sogKnots × (durationMinutes + marginMinutes) / 60`, measured backward along the route from the crossing:
`startPointRouteDistanceNm = crossingRouteDistanceNm − plannedStartDistanceNm`, then interpolate on route geometry.
Assumption (displayed): SOG stays constant. If the point lies behind the vessel's current route progress → `start-overdue`.
Straight-line distance must not replace route distance when route geometry exists (FR-007).

## Vessel progress on route
Project vessel onto route (nearest point on line). Off-route tolerance default **1 nm (PROPOSED)** → warning, ETA marked lower confidence.

## Boundary crossing detection (domain/geospatial)
1. Intersect route with polygon rings; sort by distance along route.
2. Classify each hit as entering/exiting by testing points just before/after along the route; touch-only → `grazing`.
3. Vessel inside polygon → `already-inside` (no entry ETA).
4. Multiple candidates → use the next **entering** crossing ahead of the vessel; list others in warnings.
5. Zero valid candidates → `no-crossing-found`. Undecidable → `ambiguous-geometry`.
**Course-projection mode** (optional): ray from position along COG for a configured horizon; labelled "assumes current course and speed continue".

## Default thresholds (PROPOSED, all user-configurable, none are regulatory values)
| Setting | Default | Note |
|---|---|---|
| staleAfterSeconds | 30 | fix older → STALE |
| maxAccuracyMeters | 100 | worse → poor-accuracy |
| plausible SOG | 0.5 – 40 kn | outside → sog-zero-or-implausible |
| off-route tolerance | 1 nm | warning |
| safetyMarginMinutes | no silent default — user must set (UNKNOWN company policy) | |
| alert thresholds | 60 / 30 / 15 / 5 min before planned start | |

## Failure cases → reason codes (see 04)
No usable/stale position · invalid coordinates · poor accuracy · SOG missing/zero/implausible · no route · no crossing · projection misses
· already inside · grazing/ambiguous · multiple candidates · dataset synthetic/unverified/expired/not-yet-effective · duration missing · start overdue.
Warnings are never hidden to tidy the dashboard.

## Implementation notes (chunk 2)
- **Geodesy:** own spherical haversine, R = 6 371 008.8 m (same radius Turf uses). Not yet compared with WGS84 geodesic (R-011).
- **Route parametrisation:** a route is a polyline linear in lon/lat; distance along a leg = fraction × leg haversine length. Crossing distance, `pointAtRouteDistance` and `projectOnRoute` all use this one parametrisation. *(A first version mixed haversine-to-hit with fractional interpolation and misclassified an exit as a graze on a 4.5° leg — fixed and covered by regression tests.)* Long legs should be densified; error on very long legs is not quantified (R-011/R-018).
- **Crossing detection:** planar lon/lat segment intersection (no antimeridian, R-012). Direction classified by sampling inside/outside at ±0.01 nm along the route (polygons/gaps narrower than this are unsupported). Hits <1e-6 nm apart merge (shared vertices).
- **Selection rule:** next `entering` crossing strictly ahead of the vessel's projected progress. An `ambiguous` hit before it, or an `exiting` hit first while the vessel is outside, → `ambiguous-geometry`. Grazes are warnings, never entries.
- **Crossing time is anchored to the fix timestamp:** `crossingAtUtc = observedAtUtc + remainingNm / SOG`. Not `now + …`.
- **Planner overdue rule:** `start-overdue` if the start point is behind the vessel's route progress **or** the planned start time is earlier than `now`.
- **Course projection:** great-circle ray from the fix along COG, sampled every 1 nm, horizon `courseProjectionHorizonNm` (default 50 nm, PROPOSED). Entries beyond the horizon are reported as `projection-misses-boundary`.
- **Clock:** the domain never reads the wall clock; `nowUtc` is always injected.

## Reference cases — SIMULATED, expected values derived by hand from the fixtures (tests/fixtures/index.ts)
Hand constant: 1° of arc on R = 6 371 008.8 m is 60.0405 nm (independent of the code under test).
| Case | Fixture | Expected | Status |
|---|---|---|---|
| RC-01 straight route, constant SOG | equator route lon −2→2, 1°×1° square lon 0..1; vessel at lon −1, 12 kn | entry at route distance 120.08 nm (exit 180.12); remaining 60.04 nm; ETA 5.003 h | WRITTEN — RAN 2026-10-12 (sandbox shim) |
| RC-02 multi-segment route vs straight line | dedicated curved route (−3,0)→(−3,2)→(−1,2)→(−1,0)→(2,0) | route ≈ 540 nm vs ≈ 300 nm straight; remaining from (−3,1) ≈ 360 nm vs ≈ 190 nm straight | WRITTEN — RAN |
| RC-03 planned start 45 min + 15 min margin | RC-01 | start = crossing − 60 min exactly; start point 12 nm before entry → lon ≈ −0.19987 | WRITTEN — RAN |
| RC-04 vessel inside | vessel lon 0.5 | `already-inside` | WRITTEN — RAN |
| RC-05 route misses polygon | route at lat 5 | `no-crossing-found` | WRITTEN — RAN |
| RC-06 grazing / multi-crossing | diamond vertex touch; U-shaped polygon (4 crossings); polygon with hole | grazing flagged, not an entry; next entering used + warning | WRITTEN — RAN |
| FOBAS benchmark | — | **UNKNOWN** — requires authorised source | BLOCKED |

## Implementation notes (chunk 3)
- **Alerts (`domain/alerts/scheduler.ts`, FR-008):** thresholds are lead times before the *planned changeover start* (default 60/30/15/5 min, PROPOSED, not regulatory). A threshold is due when `minutesUntilPlannedStart ≤ T` and it has not fired.
  If several thresholds are already passed on first sight (plan first computed at 20 min), only the **closest** one alerts; the rest are reported as `skipped` (stale 60/30-min alerts would be noise).
  A fired threshold **re-arms** only after the countdown rises above `T + 2 min` (`REARM_MARGIN_MINUTES`, PROPOSED) so SOG jitter cannot re-trigger it. `start-overdue` alerts once and re-arms when a valid plan returns.
  Alert text carries the plan's labels (`SIMULATED`, DEMO banner) and the words "Advisory only"; it never says compliant/approved. Unavailable plans raise nothing (except `start-overdue`).
- **Progress-continuity (`domain/geospatial/continuity.ts`, R-019):** with a previous along-route progress, only segments overlapping `[prev − 2 nm, prev + 25 nm]` (PROPOSED) are projected onto. If the windowed fit is farther than `offRouteToleranceNm` the hint is distrusted and the global projection is used, flagged `global-fallback`, and the ETA carries a visible warning. No hint → global projection (unchanged chunk-2 behaviour). Applies to `route` mode only.
  Limit: if a vessel genuinely jumps more than the window between fixes it will be treated as lost-track (fallback), not silently re-tracked.
- **Monitoring use-case:** `fix → assessPosition → analyzeRouteApproach|analyzeCourseProjection → computeEta → planChangeover → evaluateAlerts`, with an injected clock. `tick()` re-evaluates with no new fix so an old fix becomes `STALE`. A provider error keeps the last fix visible (it ages to STALE) and shows the error beside it; it never substitutes a value.
  Badge: `LIVE` (usable, real) · `SIMULATED` (usable, simulated) · `STALE` (fix older than limit) · `UNAVAILABLE` (no fix, invalid, or poor accuracy — reason shown separately).
- **Adapters:** the browser adapter converts m/s→knots with `domain/units`, keeps null/NaN/negative speed and out-of-range heading as `null`, and uses the *fix* timestamp (ADR-018). The simulator moves `speed × simulated time` along the route; COG is the route bearing; SOG/COG can be switched off to test the unavailable paths. In simulator mode the monitoring clock MUST be the simulator's `simulatedNowUtc`.

### Reference case RC-07 (chunk 3) — SIMULATED, hand-derived
EQ_ROUTE (entry at 120.081 nm), 12 kn, 20 min duration + 10 min margin, 60 s simulator steps: minutes until planned start `m_k = 570.405 − k`. Alerts expected at k = 511 (60), 541 (30), 556 (15), 566 (5); planned start overdue at k = 571. Test: `tests/integration/monitoring.test.ts` — WRITTEN, RAN (shim).
