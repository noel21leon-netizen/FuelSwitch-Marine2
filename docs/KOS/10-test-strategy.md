# 10 — Test Strategy

Status: PROPOSED. Tests must be deterministic and independent of live GPS, tile servers and regulatory services (NFR-006).

## Layers
- **Unit (Vitest, node):** all of `src/domain`. Fixtures from the synthetic polygon/route + small hand-made polygons.
- **Integration (Vitest + fake-indexeddb):** persistence/reload, export contents, alert de-duplication, use-cases with fake ports.
- **E2E (Playwright, optional):** only if configurable in the environment; offline reload and install-manifest checks.
- **Manual real-phone:** Android Chrome and iOS Safari over HTTPS (guide delivered in chunk 5).
- **Static scaffold check (no deps):** `npm run verify:scaffold`.

## Required matrix (from Master Prompt) — status after chunk 3
| Area | Cases | Chunk | Status |
|---|---|---|---|
| Units/time | knot, nm, hour, ISO UTC conversions, invalid inputs, impossible dates | 2 | WRITTEN — RAN (shim) — `units-position.test.ts` |
| Position quality | missing/zero/implausible SOG, invalid coords, invalid/future timestamp, stale, poor accuracy | 2 | WRITTEN — RAN (shim) |
| Distance | route vs straight-line (RC-02) | 2 | WRITTEN — RAN (shim) — `geospatial.test.ts`, `eta.test.ts` |
| Boundary | intersection, entry/exit, none, multiple, already inside, grazing, hole, edge-collinear, start-on-boundary | 2 | WRITTEN — RAN (shim) |
| Planner | start time, start position (RC-03), overdue, missing duration/margin | 2 | WRITTEN — RAN (shim) — `planner.test.ts` |
| Recalc | speed/route/duration/margin changes (domain level) | 2 | WRITTEN — RAN (shim); UI-level recalculation chunk 4 |
| Datasets | synthetic/unverified/verified/expired/not-yet-effective/wrong category; parser validation; SOx≠NOx | 2 | WRITTEN — RAN (shim) — `regulations.test.ts` |
| Architecture | domain purity: no UI/infra imports, no browser globals, no clock, no FOBAS function | 2 | WRITTEN — RAN (shim) — `architecture.test.ts` |
| Alerts | thresholds, duplicate suppression, first-sight skip, re-arm, overdue, label wording; denied permission → in-app only | 3 | WRITTEN — RAN (shim) — `alerts.test.ts` (16), `monitoring.test.ts` |
| Progress-continuity | hairpin route: global picks wrong leg, window keeps leg, fallback flagged (R-019) | 3 | WRITTEN — RAN (shim) — `continuity.test.ts` (10) |
| Adapters | GPS mapping (units, nulls, timestamps), error mapping, single watcher; simulator determinism/end/no-SOG; notifications (unsupported/denied/SW/fallback/failure); dataset loader | 3 | WRITTEN — RAN (shim, fakes only) — `adapters.test.ts` (37) |
| Monitoring integration | end-to-end simulated approach (RC-07), stale on tick, provider errors, sog-missing, poor accuracy, recalculation on config change | 3 | WRITTEN — RAN (shim) — `monitoring.test.ts` (16) |
| Layering | application/infrastructure import rules, injected clock, no formulas in adapters/UI | 3 | WRITTEN — RAN (shim) — `layering.test.ts` (8) |
| Persistence | reload, export contents | 3/5 | NOT WRITTEN |
| Scaffold | manifest/icons/KOS/geojson/index.html/brace-dir hygiene | 1–2 | WRITTEN — RAN: 14/14 |

## Test runner used so far
Tests import from `vitest` and are written for real Vitest (`vite.config.ts` → `tests/**/*.test.ts`). In the offline sandbox Vitest could not be installed, so
they were executed with `tsx --test` against a throwaway **API shim of Vitest backed by `node:test`** that lives *outside* the repository.
The shim implements only the matchers these tests use (chunk 3 added `toMatchObject`, `expect.stringMatching`, `toBeGreaterThanOrEqual`). Real `npm test` has **NOT** been run (R-017). The shim could mask a Vitest-specific difference.

## Evidence rule
Record the exact command, date and result in `11-release-readiness.md`. Never write "passed" for anything not run.

## Chunk 5A additions
- `tests/unit/changeover-log.test.ts` (23 tests) and `tests/unit/csv-export.test.ts` (14 tests): creation validation, human-only confirmation, skew tolerance (2 min ok / 3 min rejected), start/completion ordering, override history and reasons, idempotent acknowledgments, storage read-back, CSV quoting, formula neutralisation, provenance and DEMO notice, sort order, file name.
- Expected values (48 min = 05:00→05:48, skew boundaries, coordinate rounding) are hand-derived, not computed by the code under test.
- Mutation check: 3 injected defects (completion-before-start allowed, formula neutralisation removed, `isSimulated` forced false) → 8 tests failed; defects reverted → 37/37 pass.

## Chunk 5B additions
- `tests/integration/log-store.test.ts` (5): round-trip, replace-by-id, newest-first ordering, corrupt records skipped and counted, storage failure propagates.
- `tests/integration/changeover-log-service.test.ts` (13): plan snapshot from a monitoring snapshot (hand-derived: 1° = 60.0405 nm → crossing − planned start = lead of 30 min), overdue draft, no-fix draft, injected id/clock, persist + reload by a fresh service, honest save failure, validation pass-through, not-found, acknowledgment/override/notes, load errors, export.
- `tests/unit/log-time-input.test.ts` (4): datetime-local ↔ ISO UTC. It found a real defect: `2026-02-31T10:00` was silently rolled to 3 March; fixed with a round-trip check.
- `tests/integration/log-store-idb.test.ts` (1): real IndexedDB path via `fake-indexeddb` — **written, NOT RUN** (package not installed in the sandbox).
- Mutation check: 4 injected defects (no persist, wrong position source, rejected records not counted, no date round-trip check) → 10 failures; reverted → all pass.
- Not covered by any automated test: React rendering, `download.ts`, real file download/clipboard, mobile datetime-local behaviour.

## Chunk 6 additions
- **e2e layer** (ADR-044): `tests/e2e/*.spec.ts` (10 tests, 4 files) with Playwright, run against the built app in Route replay mode with a paused-then-advanced page clock. Always described as *headless desktop Chromium, not a phone*. **Written; never run** (R-041). Not matched by Vitest (`*.test.ts` only). Run: `npx playwright install chromium` once, then `npm run test:e2e`.
- Specs avoid exact timing where the app does not guarantee it: ranges for minutes-to-start, regex for coordinates, and alerts checked through the Log tab's *Acknowledge* buttons (the Dashboard alert line is transient). Scenario numbers come from the real controller (KOS 11, chunk 6).
- `tests/unit/contrast.test.ts` (5): WCAG contrast of the text tokens computed from `src/styles/tokens.css`; negative-tested against the original CSS (3 of 5 fail there).
- Runner note: chunk 6 ran the whole unit/integration suite on a shim again (411 tests, 410 pass, 1 not run for a missing package). It is still **not real Vitest** (R-017).
- Not covered by any automated test, e2e included: real GPS, notification delivery, install prompt, update flow, map tile behaviour, iOS, storage eviction, clipboard copy, and rendering on a phone.

