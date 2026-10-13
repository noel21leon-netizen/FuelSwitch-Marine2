# KOS / Architecture Changelog

## 2026-10-13 — iPhone Home Screen GPS wording (ADR-049, v0.5.0 label unchanged)
- Touches FR-003, FR-001, R-046 (new), KOS 13 row P-64 (new). Owner request. `describeGpsState` gets an optional `standalone` flag; `App.tsx` passes `isStandalone` from the install environment. On iPhone + Home Screen + permission denied it says: "Home Screen apps on iPhone may not allow GPS. Open the link in your browser instead." and no longer shows the Settings steps, "in the browser settings" or the Try GPS again button. All other states are unchanged.
- Files: `src/application/use-cases/gpsStatus.ts`, `src/app/App.tsx`, `tests/unit/gps-status.test.ts` (+2 tests), `ci.yml` (expected count 441), CLAUDE.md, KOS 02/08/09/11/13.
- **Verified (sandbox):** 15 tests pass on a home-made stand-in for Vitest (not real Vitest); 2 deliberate defects were caught; strict `tsc` exit 0 on `gpsStatus.ts` only. **NOT verified:** real `npm test` (expected 441), real `tsc` of `App.tsx`, build, and anything on an iPhone.

## 2026-10-13 — GPS reliability: retry and clearer messages (ADR-048, v0.5.0 label unchanged)
- Touches FR-003, FR-001, NFR-005/009, R-003, R-007, new R-045. Owner request: more reliable GPS, like a maps app.
- Changed `browserPositionProvider.ts` (auto-restart with 2/4/8/15 s waits; silent restart after 45 s of silence; stale callbacks ignored; permission denied never retried), `ports.ts` (optional `retry` on error events), `monitoring.ts` (keeps `retry`; `start()` clears the old error), `App.tsx` (GPS status block + **Try GPS again**). New `gpsStatus.ts` (`describeGpsState`).
- 28 new tests (`gps-status.test.ts`, `gps-reliability.test.ts`); KOS 13 gets P-26…P-29 (NOT RUN); CLAUDE.md and `ci.yml` (expected test count 439) updated.
- **Verified (sandbox):** strict `tsc` exit 0 on the changed non-UI code and new tests; 43 tests pass on a stand-in for Vitest; 3 deliberate defects were caught. **NOT verified:** real `npm test`, real `tsc` of `App.tsx`, `npm run build`, e2e, and everything on a phone.

## 2026-10-13 — CI checks workflow; owner phone report recorded (v0.5.0 label unchanged)
- Touches ADR-047, KOS 11/13. Added `.github/workflows/ci.yml`. No file under `src/` or `tests/` changed.
- Recorded the failed Pages run #1 (missing `src`/`tests` after a web upload), Pages run #2 (green, log unseen) and the owner's verbal phone report. KOS 13 rows deliberately left NOT RUN (no per-row detail).
- **NOT verified:** the new workflow; real `npm test` (411), `npm run test:e2e`, `npm audit` results; per-row phone evidence.

## 2026-10-12 — Post-chunk 6 — GitHub Pages deploy workflow (v0.5.0 label unchanged)
- Touches NFR-001 (installability needs HTTPS hosting), ADR-046. Owner reported an all-black screen after uploading the project to GitHub and opening it. Likely cause (from source, not reproduced in a browser): the raw repository was served, but `index.html` loads `/src/main.tsx`, which needs `vite build`.
- Added `.github/workflows/deploy-pages.yml` (install, `npm run build`, publish `dist/`). Repo setting required: Settings → Pages → Source: GitHub Actions. No file under `src/` or `tests/` changed.
- **Verified (sandbox):** `verify:scaffold` re-run. **NOT verified:** the workflow itself, a real build (typecheck still not run since chunk 4), the deployed site, anything on a phone.

## 2026-10-12 — Chunk 6 (v0.5.0 label unchanged) — e2e specs, hardening checks, contrast fix, release-readiness review, final report
- Touches NFR-008 (text legibility), NFR-001/NFR-003 and FR-008/FR-010 (tests only), ADR-044, ADR-045, R-039, R-041…R-044. Brief items 1–5. **No feature was added.**
- **e2e:** `playwright.config.ts`, `tests/e2e/support.ts`, `tests/e2e/fixtures/datasets.ts` and four specs (10 tests): dashboard/plan/alerts/skipped-alert row, log + CSV + reload, dataset status (SYNTHETIC, UNVERIFIED, EXPIRED ×2, via `page.route()`), offline reload with the real service worker. New script `npm run test:e2e`, new dev dependency `@playwright/test` ^1.56.0, `playwright.config.ts` added to `tsconfig.node.json`, `test-results`/`playwright-report` ignored. Labelled *headless desktop Chromium, not a phone*.
- **Hardening:** found by arithmetic on the tokens that secondary text was 3.64:1 (panel) / 4.18:1 (app background): fixed with a new `--ink-300` text token (`--ink-500` now borders only) and `tests/unit/contrast.test.ts` (5 tests, negative-tested). Lockfile analysis: 161 of 581 packages are in the non-dev graph; `@turf/turf` (≈130 packages) is declared but never imported (R-043, left for the owner). `npm audit` could not run (R-044).
- **Reviews:** R-001…R-044 each have a recorded state in KOS 08 (1 closed, 2 partially mitigated, 41 open); release gates restated in KOS 11, none met; final report in KOS 14. Docs: KOS 09 (ADR-044/045), 10, 11, 08, 00, 14, README, CLAUDE.md, NEXT_STEPS.
- **Verified (sandbox):** `verify:scaffold` 14/14 (static); strict `tsc` (TS 6.0.3) on `src/domain`+`src/application`+`src/shared` exit 0; 411 tests on a node:test Vitest shim (not real Vitest): 410 pass, 1 not run (`fake-indexeddb` missing); e2e files typechecked against Playwright 1.56 types; dataset fixtures and alert scenarios run through the real parser, presenter, simulator and controller; Playwright clock mechanics checked on a throwaway page.
- **NOT verified:** real `npm install`/`typecheck`/`test`/`build`; **the e2e specs themselves (never run)**; `npm audit`; lockfile regeneration (`@playwright/test` is not in it); the whole phone checklist; rendering of the contrast fix on a phone.

## 2026-10-12 — Chunk 5C-4 (v0.5.0) — manual phone checklist, PWA acceptance table, version label
- Touches NFR-001, NFR-003, FR-010 (documentation only). Brief items 5 + 6. No file under `src/` or `tests/` was changed; dataset status, install help, precache scope, fix age and skipped alerts are untouched.
- Added `docs/KOS/13-phone-test-checklist.md`: 41 rows in 7 sections (install, offline/service worker, GPS and background limits, alerts/notifications, dataset status, log/export, readability). Every row NOT RUN with date/device/notes columns. `verify-scaffold` now requires the file.
- KOS 11: PWA acceptance table rewritten with an evidence type per criterion (static / test / seen / device) and checklist references; nothing is device-verified. 5C-4 evidence section added.
- `package.json` and the lockfile's root entries: 0.3.0 → 0.5.0 (label for the end of chunk 5, not a release; R-040). KOS 00 delivery table brought up to date (chunks 4 and 5 were still marked NOT STARTED). ADR-043, risk R-040.
- **Verified (sandbox):** `verify:scaffold` 14/14 (static); `package.json` / lockfile parse as JSON; the 5C-3 headless-Chromium preview of the real app source (with stand-ins for `idb`, `leaflet`, `workbox-window`) rendered Dashboard and More with no page errors. Tests were not re-run (no code changed); last run 5C-3: 406 tests, 405 pass, 1 not run.
- **NOT verified:** real `npm install` / `typecheck` / `build` / `npm test` since chunk 4; lockfile regeneration; the whole phone checklist; any real-device install, offline, GPS, notification or file-download behaviour.

## 2026-10-12 — Chunk 5C-3 (v0.4.5-chunk5c3) — fix age with stale limit, skipped alert thresholds with reasons
- Touches FR-001, FR-008, NFR-008 (wording only). Brief item 4 only; dataset status, install help and the precache scope (5C-2) and the phone checklist (5C-4) are untouched. Version stays 0.3.0 until 5C-4.
- Inspected first: `App.tsx` already had a Fix age row; `evaluateAlerts` already returned `skipped: number[]`; `MonitoringController`/`MonitoringSnapshot` did not expose it. All three confirmed before editing.
- Added pure `describeFixAge` (`domain/position/fixAge`): age + status word + stale limit; unavailable with reason and no number for no fix, invalid data or a future timestamp; poor accuracy shows the measured age and says the fix is not used. Dashboard Fix age row uses it with `staleAfterSeconds` from the controller config.
- Scheduler: `AlertEvaluation.skippedDetail` (reason `already-passed-at-start` | `superseded-by-closer`, plus the closer threshold that was alerted); `skipped: number[]` unchanged; new optional `AlertState.planSeen` (INITIAL_ALERT_STATE sets false; a state without it counts as first sight). `describeSkippedThreshold` words each skip. The firing rules themselves did not change.
- Controller: `MonitoringSnapshot.skippedThresholds` is a session-only cumulative list (scheduler detail + `recordedAtUtc`), unchanged by ticks, empty in a new controller. Dashboard: *Skipped alerts* row. ADR-040…042, risks R-037…R-039; KOS 02/03/08/09 updated.
- **Verified (sandbox):** 21 new tests (fix-age 8, alerts +8, monitoring +5) and the whole suite on a Vitest-API shim (not real Vitest): 406 tests, 405 pass; the 1 not run is the `fake-indexeddb` test (package not installed). Strict `tsc` (TS 6.0.3, project flags, sandbox stubs) over `src/domain`, `monitoring.ts` and the changed tests: 0 errors. `App.tsx` syntax parse: 0 diagnostics. Mutation check: 5 injected defects (reason inverted, `planSeen` never set, future timestamp clamped to 0, list replaced instead of accumulated, list cleared on tick); 4 detected at once, the replace-instead-of-accumulate defect **survived** until an accumulation test was added, then was detected.
- **NOT verified:** real `npm install` / `typecheck` / `build` / `npm test`, browser rendering of the new Dashboard rows, behaviour on a phone.
- Changed an existing test file only to add `skippedThresholds: []` to a hand-built `MonitoringSnapshot` literal (`changeover-log-service.test.ts`).

## 2026-10-12 — Chunk 5C-2 (v0.4.4-chunk5c2) — dataset status + EXPIRED/UNVERIFIED notice, install help, precache-scope test
- Touches FR-010, FR-001 (Next boundary row), NFR-001, NFR-005. Brief items 2 and 3 only; the Dashboard fix-age/skipped-threshold display (5C-3) and the phone checklist (5C-4) are untouched. Version stays 0.3.0 until 5C-4.
- Added pure `describeDatasetStatus` (`domain/regulations/datasetStatus`): source, version, declared vs shown status, effective dates, notices for SYNTHETIC / UNVERIFIED / EXPIRED / NOT YET EFFECTIVE / NOT USABLE / UNAVAILABLE / unknown source / unknown version. It reuses `evaluateDatasetUsability`; blocked results gained a machine-readable `code` (backward-compatible). A dataset declared verified but past its end date is shown as EXPIRED, never VERIFIED. ADR-037.
- More tab: the old "Regulatory data status" text is replaced by `DatasetStatusPanel` (status, source, version, dates, notices, assessment time and clock, NOx scope text kept). Dashboard "Next boundary" row now shows the one-line status.
- Added install help: pure `installAdvice(env)` + `describeInstallOutcome` (application), `InstallPromptPort`/`InstallEnvironment` (ports), install-prompt adapter core + browser wiring (infrastructure/pwa), `useInstallAdvice` + `InstallHelpPanel` (features/pwa). Outcomes: already installed / install prompt available / iOS Share → Add to Home Screen / not available (reason). States that HTTPS is required and a self-signed dev certificate usually will not install on a phone. ADR-038.
- Added `tests/integration/precache-scope.test.ts` pinning the precache scope (geojson precached; one navigation route only; no runtime caching, no fetch handler, no `clientsClaim()`). ADR-039. KOS 02/03/07/08/09 updated; risks R-033…R-036.
- **Verified (sandbox):** 384/384 on the Vitest-API shim (322 previous + 62 new: dataset-status 26, install-advice 13, install-prompt 13, precache-scope 10; real `npm test` expected 385 with the fake-indexeddb test); mutation check 7/7 injected defects detected; strict `tsc` with sandbox stubs: 0 errors in every file added or edited in 5C-2 except `App.tsx`, whose only reported errors are stub artifacts on lines from earlier chunks (none on an edited line); TSX syntax parse clean; `verify:scaffold` 14/14.
- **Defect found by the new tests:** none in the code under test. One test-helper bug (comment stripper read the `/*` in a glob string as a comment) was fixed in the test.
- **NOT verified:** project `typecheck`/`build`, real Vitest, browser rendering of the new panels, `beforeinstallprompt` on Chromium, iOS wording on a device, real service-worker caching.

## 2026-10-12 — Chunk 5C-1 (v0.4.3-chunk5c1) — service-worker registration + update/offline UI
- Touches FR-010, NFR-003 (partial). 5C is split into 5C-1…5C-4 (ADR-036); this part covers brief items 1 (registration + visible states) only. Items 2–6 follow in 5C-2…5C-4.
- Added `ServiceWorkerRegistrar` port + `PwaLifecycleEvent` types; pure `reducePwaState` / `applyPwaUpdate` (`application/use-cases/pwaStatus`); registrar core + `workbox-window` wrapper (`infrastructure/pwa`); `features/pwa` (wording, `usePwaStatus`, update banner, More-tab status panel); header chip OFFLINE READY.
- Update policy: applied only on user tap, never automatic; `sw.ts` still has no `clientsClaim()` (comment-only change). Not registered in dev builds. ADR-034/035/036, risks R-030…R-032.
- **Verified (sandbox):** 322/322 on the Vitest-API shim (272 previous + 50 new; real `npm test` expected 323 with the fake-indexeddb test); mutation check 9/9 injected defects detected; strict tsc with stubs: 0 errors in new/edited PWA files; TSX syntax parse 0 diagnostics; verify-scaffold 14/14.
- **NOT verified:** project `typecheck`/`build`, real Vitest, real service-worker registration, caching, update flow or offline reload in any browser or device, `workbox-window` typings against the real package.

## 2026-10-12 — Chunk 5B (v0.4.2-chunk5b) — log persistence, Log tab, CSV download
- Touches FR-009, FR-012. Service worker, install flow and alert display untouched (5C).
- Added `LogStore` port; `createLogStore` (validation/ordering, corrupt records counted) + IndexedDB backend; `ChangeoverLogService` + `buildLogDraft` + `currentPositionLonLat` use cases (injected clock/id; honest save-failure reporting).
- Replaced the Log placeholder with `ChangeoverLogPanel` (create from current plan, confirm start/completion, acknowledge session alerts, correct with required reason, notes, Download/Copy CSV); SIMULATED badge + DEMO banner on simulated/synthetic entries. App now accumulates session alerts and supplies a log clock (simulated time in simulator mode).
- Defect fixed: `localInputToUtcIso` rolled impossible dates over (31 Feb → 3 Mar).
- Added 22 runnable tests + 1 fake-indexeddb test (NOT RUN). ADR-032/033, risks R-028/R-029.
- **Verified (sandbox):** 272/272 on the Vitest-API shim; strict tsc with stubs exit 0; TSX syntax parse; mutation check (10 failures with 4 defects).
- **NOT verified:** project typecheck/build, real Vitest, fake-indexeddb test, React rendering, real download/clipboard, any device behaviour.

## 2026-10-12 — Chunk 5A (v0.4.1-chunk5a) — changeover log domain + CSV export
- Touches FR-009, FR-012 (partial). **Domain + tests + KOS only; no UI, persistence, SW or package changes.**
- Added `domain/logging/changeoverLog` (create, human-confirmed start/completion, acknowledgments, overrides with mandatory reason, storage read-back parser) and `domain/logging/csvExport` (RFC 4180, formula-injection guard, provenance + DEMO notice columns, deterministic order, file name).
- Defect found by strict tsc and fixed: type name collision `PositionSource` → `LogPositionSource`.
- Added 37 tests (log 23, CSV 14). ADR-029…031, risks R-026/R-027.
- **Verified (sandbox):** 250/250 on the Vitest-API shim; strict tsc with stubs exit 0; mutation check (8 failures with 3 injected defects).
- **NOT verified:** project typecheck/build after this change, real Vitest, any browser/device behaviour.
- Remaining for chunk 5: 5B (IndexedDB log store, Log UI, download) and 5C (SW registration, update/offline UX, install help, fix-age/skipped thresholds, phone checklist).

## 2026-10-12 — Chunk 3 (v0.3.0-chunk3) — adapters, alert scheduler, monitoring
- Touches FR-003, FR-004, FR-005 (R-019), FR-006, FR-008. **No UI, map or persistence code changed.**
- Added `domain/alerts/scheduler` (pure) and `domain/geospatial/continuity` (R-019); `RouteApproachInput.progressHint` optional; `projectOnRoute` got an optional segment window (backward-compatible).
- Added `application/ports.ts` (`PositionProvider`, `NotificationProvider`) and `application/use-cases/monitoring.ts` (`evaluateMonitoring`, `MonitoringController`, badge LIVE/SIMULATED/STALE/UNAVAILABLE).
- Added adapters: browser GPS, deterministic route-replay simulator, browser notifications, local dataset loader.
- Added 87 tests (alerts 16, continuity 10, adapters 37, monitoring 16, layering 8); RC-07 written. `shared/constants`: `NOTIFICATION_LIMIT_TEXT`.
- ADR-023…027, risks R-022…R-025, R-019 partially mitigated. IndexedDB persistence deferred to chunk 4/5 (ADR-027).
- **Verified (sandbox):** 213/213 tests on the Vitest-API shim; strict `tsc` with stubs exit 0; verify-scaffold 14/14; mutation check (15 failures with 3 injected defects).
- **NOT verified:** `npm install`, project `typecheck`, `build`, real Vitest, any browser/device behaviour, real GPS, real notifications.

## 2026-10-12 — Chunk 2 (v0.2.0-chunk2) — pure domain layer
- Touches FR-005, FR-006, FR-007, FR-011, NFR-004, NFR-006. Domain only; **no UI, GPS, map, persistence or notification code changed.**
- Added `src/domain`: units/ISO-UTC, geodesy, routes (projection, point-at-distance), polygons, boundary crossings (entering/exiting/grazing/ambiguous), position + SOG validation, dataset model/parser/usability rules, NOx input-completeness module, route ETA + course-projection ETA, `ChangeoverCalculator` port with manual-verified calculator, changeover planner (start time + start point), `config` defaults.
- Added 126 unit tests in 6 files and `tests/fixtures` (hand-derivable geometry + dedicated curved route for RC-02). RC-01…RC-06 now written; FOBAS benchmark still BLOCKED/UNKNOWN.
- Fixed chunk-1 literal brace-named directories; `verify:scaffold` extended to 14 checks (negative-tested).
- Fixed `parseIsoUtc` impossible-date acceptance; fixed route parametrisation mismatch (ADR-017).
- ADR-016…022, risks R-017…R-021, KOS 02/04/05/08/09/10/11 updated.
- `tsconfig.json`: added `node` types (ADR-022, unverified).
- **Verified (sandbox):** strict `tsc` on domain+tests (with stubs), 126/126 tests via Vitest-API shim, verify-scaffold 14/14.
- **NOT verified:** `npm install`, project `typecheck`, `build`, real Vitest, SW, any browser/device behaviour.

## 2026-10-12 — Chunk 1 (v0.1.0-chunk1)
- Initialised KOS (14 files) from owner baseline `FuelSwitch_Marine_KOS_Architecture.md` and Master Prompt. Workspace was empty; nothing overwritten.
- Added `CLAUDE.md`, `README.md`, `NEXT_STEPS.md`.
- Scaffold: Vite + React + TS config, strict tsconfigs, `vite-plugin-pwa` injectManifest config, `src/sw.ts` (not yet registered).
- PWA static assets: `manifest.webmanifest`, icons 192/512 + maskable 192/512 + apple-touch 180 + SVG favicon.
- Synthetic data: `synthetic-eca.geojson`, `synthetic-route.geojson` (status `synthetic`, DEMO notice).
- Minimal phone-first shell (header, DEMO banner, status chips, bottom nav, safe-area CSS, background-GPS limit text).
- Added ADR-008…015 (proposed). Added risks R-008, R-016.
- Verification actually run: `verify-scaffold` 12/12 static checks; syntax-only TS parse of 5 source files; ad-hoc route/polygon crossing check (2 crossings). Details in `11-release-readiness.md`.
- Finding: bundled synthetic route is nearly straight; chunk 2 must add a curved fixture for RC-02.
- **Unverified:** dependency install, typecheck, build, tests, SW behaviour, device install — all NOT RUN (sandbox had no network).

## 2026-10-12 — Chunk 4 (v0.4.0-chunk4) — monitoring UI, map and settings
- Touches FR-001, FR-002, FR-003, FR-004, FR-006, FR-008, FR-011, NFR-002, NFR-008, NFR-009.
- Replaced the placeholder shell with dashboard status/ETA/planner views, simulator and browser GPS source selector, alert permission/test controls, separate SOx/NOx status and advisory limits text.
- Added Leaflet route, synthetic boundary, vessel, predicted crossing and planned start overlays. Tile service is an optional network dependency; DEMO banner remains visible.
- Added IndexedDB LocalStore adapter and persisted planner/source settings; added responsive metrics/forms/map styling.
- Verification: 
pm run verify:scaffold RAN (14/14). 
pm run typecheck, 
pm test, and 
pm run build attempted but NOT RUN successfully because 	sc and itest are not installed (
ode_modules absent); no network install was attempted. Browser/device checks NOT RUN.
- Remaining: build/typecheck against actual dependencies, expose fix age and skipped thresholds, settings fault-tolerance verification, offline/service-worker registration and log/export in chunk 5.


- Follow-up verification (2026-10-12): installed 534 packages and generated package-lock. Real Vitest: 213/213 passed. Strict project typecheck: passed. Vite production build including injectManifest SW: passed (12 precache entries). verify-scaffold: 14/14. Initial sandbox EPERM was resolved by elevated run. npm reported 6 audit advisories (3 moderate, 1 high, 2 critical), not remediated. Browser/device behavior NOT RUN.

