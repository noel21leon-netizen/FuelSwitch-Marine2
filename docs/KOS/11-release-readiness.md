# 11 — Release Readiness

Updated: 2026-10-12 (after chunk 6; version 0.5.0 is a label, NOT a release; the chunk 6 e2e specs are written and have NEVER been run). Gate states: MET · NOT MET · NOT RUN · PARTIAL.

## Evidence log
| Date | Command / activity | Result |
|---|---|---|
| 2026-10-12 | `npm install` (sandbox) | NOT RUN to completion — timed out, no network |
| 2026-10-12 | `npm run build`, `npm test`, `npm run typecheck` | NOT RUN (dependencies not installed) |
| 2026-10-12 | `node scripts/verify-scaffold.mjs` | RAN: 12/12 static checks passed (KOS files, manifest fields, icon files + pixel sizes, index.html viewport/manifest links, synthetic GeoJSON metadata and closed ring, SW source, package scripts, naming). Static only — not a build/typecheck/test result |
| 2026-10-12 | Syntax-only parse of `src/main.tsx`, `src/app/App.tsx`, `src/shared/constants.ts`, `src/sw.ts`, `vite.config.ts` using the sandbox's TypeScript 6.0.3 `transpileModule` | RAN: no syntax errors. NOT a type check (React/Vite types not installed); project pins TypeScript ^5.6.3 |
| 2026-10-12 | Geometry sanity check of synthetic route vs polygon (ad-hoc Python, spherical estimate) | RAN: 2 crossings (enter ≈ −19.745,−8.550; exit ≈ −16.749,−8.756); route start and end outside polygon. SIMULATED data only; not a unit test in the repo |
| 2026-10-12 | `npm install` retried in chunk-2 sandbox (network still disabled; `--offline` → ENOTCACHED) | NOT RUN — no dependencies installed; Vite/Vitest/React/Turf unavailable |
| 2026-10-12 | Strict `tsc` (sandbox TypeScript 6.0.3; flags mirror project: strict, noUncheckedIndexedAccess, noUnused*) over `src/domain`, `src/shared` | RAN: exit 0, no errors |
| 2026-10-12 | Strict `tsc` over `src/domain` + `tests/**` with sandbox-only stubs for `node:fs/url/path` and the Vitest shim types | RAN: exit 0, no errors (stubs, not real `@types/node`) |
| 2026-10-12 | Domain unit tests via `tsx --test` + **Vitest API shim (not real Vitest)** | RAN: 126 tests, 126 pass, 0 fail (units-position 18, geospatial 25, eta 34, planner 16, regulations 27, architecture 6). Real `npm test`: NOT RUN |
| 2026-10-12 | `node scripts/verify-scaffold.mjs` after chunk 2 (2 new hygiene checks; brace-dir check negative-tested) | RAN: 14/14 |
| 2026-10-12 | Project `npm run typecheck` (tsconfig.json now includes `node` types, ADR-022), `npm run build`, `npm run dev` | NOT RUN |
| 2026-10-12 | Chunk 3: strict `tsc` (sandbox TypeScript 6.0.3, same flags) over `src/domain`, `src/application`, `src/infrastructure`, `src/shared`, `tests/**` with sandbox-only stubs for `node:*` and `vitest` | RAN: exit 0, no errors (stubs, not real `@types/node`/Vitest types; DOM lib real) |
| 2026-10-12 | Chunk 3: all tests via `tsx --test` + Vitest API shim (outside repo) | RAN: **213 tests, 213 pass, 0 fail** (chunk-2 126 + 87 new: alerts 16, continuity 10, adapters 37, monitoring 16, layering 8). Real `npm test`: NOT RUN |
| 2026-10-12 | Chunk 3: mutation check of the new tests (3 deliberate defects: duplicate suppression removed, continuity hint ignored, missing speed → 0) | RAN: 15 tests failed with the defects in place; defects reverted; 213/213 pass again |
| 2026-10-12 | `node scripts/verify-scaffold.mjs` after chunk 3 | RAN: 14/14 (static only) |
| 2026-10-12 | Project `npm run typecheck` / `build` / `dev` / `npm install` after chunk 3 | NOT RUN (sandbox has no network; no `vite`, `react`, `@types/*`) |
| 2026-10-13 | GitHub Actions "Deploy to GitHub Pages" #1 (commit e18903a, `src/` and `tests/` not yet in the repo) | FAILED at `npm run typecheck`: `error TS18003: No inputs were found in config file tsconfig.json` (include `src`,`tests`). Cause: web upload had dropped the folders. Not a code defect. Seen in owner screenshots |
| 2026-10-13 | GitHub Actions "Deploy to GitHub Pages" #2 (commit 9412968, after `src`/`tests` were uploaded) | Owner screenshot: run green, 41 s. The build log was NOT seen by the assistant, so the exact typecheck/build output is unrecorded; assumed to include `npm run build` (typecheck + `vite build`) but not confirmed |
| 2026-10-13 | Earlier "pages build and deployment" run (GitHub's built-in branch publisher) | Green but deployed raw source: page source showed `/src/main.tsx`, black screen (ADR-046). Not a build |
| 2026-10-13 | Phone quick pass on the deployed HTTPS site | Owner reported "all are working" on an iPhone 12 Pro (iOS/Safari versions not given); no per-row detail. KOS 13 rows not changed (see the owner note there). Not assistant-verified |
| 2026-10-13 | `.github/workflows/ci.yml` added (typecheck, `npm test`, `npm audit`, e2e) | NOT RUN — workflow written, never executed (ADR-047) |
| 2026-10-13 | GPS reliability (ADR-048): strict `tsc` (sandbox TypeScript 6.0.3, project flags, DOM lib real, sandbox-only stub for `vitest` types) over `src/domain`, `src/application`, `src/infrastructure/geolocation`, `src/shared` and the two new test files | RAN: exit 0, no errors. `src/app/App.tsx` only syntax-parsed (0 diagnostics), NOT type-checked (React/Vite types not installed) |
| 2026-10-13 | GPS reliability tests on a **sandbox stand-in for the Vitest API (not real Vitest)**: new `tests/unit/gps-status.test.ts` (13), new `tests/integration/gps-reliability.test.ts` (15: provider retry/backoff/watchdog/stop-start 12 + controller 3), plus the 15 pre-existing `mapBrowserFix` / `mapGeolocationError` / `BrowserPositionProvider` tests copied from `adapters.test.ts` | RAN: 43 passed, 0 failed. Real `npm test` (expected 439 = 411 + 28) NOT RUN |
| 2026-10-13 | Mutation check of the new provider tests (3 deliberate defects: backoff never grows; permission denied retried; late callbacks of a dropped watch not ignored) | RAN: each defect made exactly one new test fail; defects reverted; 12/12 pass again |
| 2026-10-13 | Home Screen wording (ADR-049): `tests/unit/gps-status.test.ts` now 15 tests (2 new) on the same **sandbox stand-in (not real Vitest)**; strict `tsc` on `gpsStatus.ts` alone; 2 deliberate defects (flag ignored; provider message kept) each made a test fail | RAN: 15 passed, 0 failed; defects caught: 2 of 2; `tsc` exit 0 on `gpsStatus.ts`. NOT RUN: real `npm test` (expected 441 = 439 + 2), `tsc` of `App.tsx` (no React packages in the sandbox), anything on an iPhone |
| 2026-10-13 | Application-layer banned-globals scan and infrastructure rule scan (hand-run copy of `layering.test.ts` rules; the real test needs `import.meta` + `node:fs`) | RAN: no hits. Real `layering.test.ts` NOT RUN |
| 2026-10-13 | GPS retry, silent-stall restart, wording and Try GPS again on a real phone (KOS 13 P-26…P-29) | NOT RUN |
| — | Real-device install/launch (Android Chrome, iOS Safari) | NOT RUN |
| — | Offline reload after first load | NOT RUN |
| — | Real GPS / notification test (adapters exist; fakes only) | NOT RUN |

## Defects found and fixed in chunk 2 (found by the tests that now guard them)
1. Chunk-1 scaffold had literal `{a,b}` directories — the intended folder structure did not exist. Fixed; guarded by `verify:scaffold`.
2. `parseIsoUtc` accepted impossible dates (e.g. `2026-02-31`) because `Date.parse` rolls them over. Fixed with a component round-trip check.
3. Crossing distance and route interpolation used different parametrisations, misclassifying an exit as a graze on a long leg. Fixed (ADR-017) with a regression test.
4. Symmetric bow-tie rings were rejected with a misleading "zero area" message. Check order fixed.
Chunk 3: the new tests found **no defect in the code under test**. Two tests initially failed because the author's hand-derived route length was wrong (EQ_ROUTE is 4° = 240.162 nm, not 240.08 nm) — a test arithmetic error, fixed in the tests; the code was not changed. A KOS comment with the entry distance was also corrected (120.081 nm).
Also found (not a defect): the bundled synthetic ECA polygon is wound clockwise (not RFC 7946). Accepted with a warning; results are winding-independent.

## PWA acceptance criteria (as of 5C-4)
Evidence type: **static** = file/config check, **test** = automated test (Vitest API shim in the sandbox unless stated; real `npm test` was last recorded in chunk 4), **seen** = looked at in headless Chromium in the 5C-3 preview (stubbed map, storage and service worker), **device** = real phone (checklist KOS 13). Nothing below is device-verified.

| Criterion | Evidence | State | Checklist |
|---|---|---|---|
| Phone-first installable PWA (not just responsive page) | static: manifest, icons, shell; test: install guidance + install-prompt adapter with fakes (26 tests) | PARTIAL — real install NOT RUN | P-01…P-06 |
| Manifest name/start_url/scope/standalone/colours/icons valid | static (`verify:scaffold` 14/14, re-run in 5C-4) | MET (static only; not an installability test) | P-02, P-03 |
| Referenced icons exist incl. maskable | static (file existence + pixel sizes) | MET (static); how the maskable icon looks on a phone NOT RUN | P-02 |
| Layout handles phone viewports, touch, safe areas | seen: Dashboard and More at 390 px wide; static: viewport-fit=cover | PARTIAL — safe areas, touch, small/large-text phones NOT RUN | P-05, P-61, P-62 |
| SW precaches shell and bundled demo data; no runtime caching, no fetch handler, no `clientsClaim()` | test: `precache-scope` (source-text, 10 tests) | MET by source-text test; actual Cache Storage contents NOT RUN | P-13 |
| Never presents stale/expired/unverified regulatory data as current | test: `dataset-status` (26) + `regulations` (27); seen: SYNTHETIC status on More and Dashboard | PARTIAL — EXPIRED/UNVERIFIED rendering NOT RUN in a browser; cached-build staleness (R-036) NOT RUN | P-40…P-44 |
| Offline after first load | test: registrar and state reducer with fakes; static: `sw.ts` precache | NOT RUN — no offline reload has ever been performed | P-10…P-12 |
| Update applied only on user tap, one reload | test: `pwa-registrar`, `pwa-status` with fakes | PARTIAL — real update flow NOT RUN | P-14, P-15 |
| Registration failure is visible | test: fakes; seen: dev-build message path only | PARTIAL — real failure banner NOT RUN | P-16 |
| UI states the background-GPS and notification limits | static: constants; seen: More tab renders | PARTIAL — behaviour while locked/backgrounded NOT RUN | P-23, P-34 |
| Fix age with stale limit; skipped-alert reasons | test: `fix-age`, `alerts`, `monitoring`; seen: both rows in replay mode | PARTIAL — live GPS and phone NOT RUN | P-20…P-22, P-31…P-33 |
| Changeover log persists and exports on a phone | test: log domain, store with fakes (IDB test needs `fake-indexeddb`); real IDB/file download/clipboard NOT RUN | PARTIAL | P-50…P-55 |
| Notifications delivered on a phone | test: adapter with fakes | NOT RUN | P-30, P-34, P-35 |
| Real mobile install/launch tested | — | NOT RUN | all of KOS 13 |

## Release gates before any shipboard trial
Real-phone tests complete · authorised FOBAS method or explicit manual-only policy · verified geometry with licence ·
review by a qualified marine engineer · all risks in 08 triaged · KOS current. **None met.**

## Chunk 4 verification (2026-10-12)
| Date | Command / activity | Result |
|---|---|---|
| 2026-10-12 | `npm install` (elevated after sandbox install stalled) | RAN: 534 packages installed; package-lock created; npm reported 6 audit vulnerabilities (3 moderate, 1 high, 2 critical). Dependency audit remediation not performed. |
| 2026-10-12 | `npm run typecheck` | RAN: initially exposed two App.tsx union-narrowing errors; fixed. Final run in `npm run build` passed all three tsconfig projects. |
| 2026-10-12 | `npm test` (Vitest 2.1.9, elevated due sandbox EPERM realpath) | RAN: 11 files, 213 tests passed, 0 failed. These tests cover domain/adapters/monitoring, not React rendering or real browser behavior. |
| 2026-10-12 | `npm run build` (Vite 5.4.21, elevated due sandbox EPERM realpath) | RAN: production bundle and injectManifest service worker built; 12 precache entries (443.75 KiB). SW is generated but not registered by app yet. |
| 2026-10-12 | `npm run verify:scaffold` | RAN: 14/14 static checks passed. |
| 2026-10-12 | Browser render, IndexedDB reload, map/tile offline behavior, GPS and notification permission | NOT RUN. |

Chunk 4 closes the dashboard's fix-age and next-boundary fields in source. Remaining UI limitations: skipped alert thresholds are not surfaced; changeover log/CSV, service-worker registration/update UX, and browser-level persistence/map checks remain for chunk 5. Real-phone checks remain NOT RUN. The 6 npm audit advisories require dependency triage before release.

## Chunk 5A verification (2026-10-12)
| Date | Command / activity | Result |
|---|---|---|
| 2026-10-12 | Domain log + CSV tests via `tsx --test` + **Vitest API shim (not real Vitest; shim lives outside the repo)** | RAN: 37 new tests, 37 pass. Whole suite: **250 tests, 250 pass, 0 fail** (213 previous + 37). Real `npm test`: NOT RUN in the 5A sandbox (no network, no node_modules) |
| 2026-10-12 | Strict `tsc` (sandbox TypeScript 6.0.3, project flags) over `src/domain`, `src/shared` and the two new test files with sandbox-only stubs for `node:*`/`vitest` | RAN: exit 0. It FOUND one defect first: `export *` name collision (`PositionSource` already exported by `domain/position`) — fixed by renaming mine to `LogPositionSource` |
| 2026-10-12 | Mutation check of the new tests (3 injected defects) | RAN: 8 failures with defects in place; 0 after revert |
| 2026-10-12 | Project `npm run typecheck`, `npm run build` after 5A | NOT RUN in the 5A sandbox — re-run locally (see NEXT_STEPS 5B step 0). 5A touches only `src/domain` (+ tests/KOS), no UI |
| 2026-10-12 | Browser/device behaviour | NOT RUN |

## Chunk 5B verification (2026-10-12)
| Date | Command / activity | Result |
|---|---|---|
| 2026-10-12 | Tests via `tsx --test` + **Vitest API shim (not real Vitest)**, excluding the `fake-indexeddb` test | RAN: **272 tests, 272 pass, 0 fail** (250 previous + 22 new). Real `npm test`: NOT RUN in this sandbox (expect 273 with the IDB test) |
| 2026-10-12 | `log-store-idb.test.ts` (fake-indexeddb) | NOT RUN — package not installed, no network |
| 2026-10-12 | Strict `tsc` (sandbox TS 6.0.3, project flags) over `src/domain`, `shared`, `application`, `infrastructure`, 3 non-React feature helpers, fixtures and the 5A/5B/monitoring tests, with sandbox-only stubs (`node:*`, `vitest`, `idb`) | RAN: exit 0 (after adjusting my stubs; the two initial errors were stub gaps, not repo defects) |
| 2026-10-12 | Syntax-only parse of `App.tsx`, `ChangeoverLogPanel.tsx`, `useChangeoverLog.ts` | RAN: 0 syntax diagnostics. **Not a type check** — React types unavailable |
| 2026-10-12 | Mutation check of 5B tests | RAN: 10 failures with 4 injected defects; 0 after revert |
| 2026-10-12 | Defects found by the new tests/checks | (1) `localInputToUtcIso` accepted impossible dates — fixed. (2) Initial design imported `idb` from the pure store module, making it untestable without a browser DB — split into `logStore.ts` / `indexedDbLogStore.ts` |
| 2026-10-12 | Project `npm run typecheck`, `npm run build`, browser rendering, IndexedDB reload, CSV download/clipboard on a phone | NOT RUN |

## Chunk 5C-1 verification (2026-10-12)
| Date | Command / activity | Result |
|---|---|---|
| 2026-10-12 | Whole suite via `tsx --test` + **Vitest API shim (not real Vitest)**, excluding the `fake-indexeddb` test | RAN: **322 tests, 322 pass, 0 fail, 0 cancelled** (272 previous + 50 new: `pwa-status` 25, `pwa-registrar` 25). Real `npm test`: NOT RUN (expect 323 with the IDB test) |
| 2026-10-12 | Mutation check of 5C-1 tests | RAN: 9 injected defects, all detected (reducer downgrade, update install treated as first install, reload after failed update, no double-tap de-duplication, apply without a waiting update, registering in dev, apply in any state, SW claiming clients, update button removed); 0 failures after revert |
| 2026-10-12 | Strict `tsc` (sandbox TS 6.0.3, project flags) over `src` + `tests` with sandbox-only stubs (`react`, `workbox-window`, `idb`, `leaflet`, `vitest`, `node:*`) | RAN: **0 errors in any file added or edited in 5C-1.** Remaining errors are stub artifacts (implicit-any JSX event parameters, CSS / fake-indexeddb side-effect imports, `setImmediate`) in code untouched by 5C-1. `sw.ts` under `tsconfig.sw.json`: 1 stub artifact (`__WB_MANIFEST`) on an unchanged line |
| 2026-10-12 | Syntax-only parse of `App.tsx`, `PwaStatusViews.tsx` | RAN: 0 syntax diagnostics. **Not a type check** of the React code against real types |
| 2026-10-12 | `npm run verify:scaffold` | RAN: 14/14 static checks (not a build or test result) |
| 2026-10-12 | Defect found by the new tests | A refused `applyUpdate()` that hangs would have been reported as "cancelled" rather than failed; tests now fail fast with a `HUNG` marker |
| — | Project `npm run typecheck`, `npm run build`, `npm run preview`; real service-worker registration, precache, update flow, offline reload; Android Chrome / iOS Safari | NOT RUN |

## Chunk 5C-2 evidence (dataset status, install help, precache-scope test)
| Date | Command / activity | Result |
|---|---|---|
| 2026-10-12 | New tests via `tsx --test` + **Vitest API shim (not real Vitest; shim lives outside the repo)** | RAN: 62 new tests, 62 pass (dataset-status 26, install-advice 13, install-prompt 13, precache-scope 10) |
| 2026-10-12 | Whole suite via the same shim, excluding the `fake-indexeddb` test | RAN: **384 tests, 384 pass, 0 fail, 0 cancelled** (322 previous + 62 new). Real `npm test`: NOT RUN (expect 385 with the IDB test) |
| 2026-10-12 | Mutation check of 5C-2 tests | RAN: 7 injected defects, all detected (past-effective-to labelled VERIFIED, unknown source not flagged, runtime route added to `sw.ts`, `geojson` dropped from `globPatterns`, iOS advice ahead of the HTTPS check, install double-tap guard removed, `appinstalled` not clearing the held event). Source restored byte-identical afterwards |
| 2026-10-12 | Strict `tsc` (sandbox TS 6.0.3, project flags) over `src/domain`, `src/shared`, `src/application`, the new infrastructure/feature files and `tests/**` with sandbox-only stubs (`react`, `node:*`, `vitest`) | RAN: exit 0, **0 errors**. Negative control (a deliberate type error) made it fail with exit 2, then restored |
| 2026-10-12 | Strict `tsc` over all of `src` + `tests` with extra loose stubs (`leaflet`, `idb`, `workbox-window`, untyped JSX) | RAN: errors only in code from earlier chunks and all stub artifacts (implicit-any JSX handlers, `import.meta.env`, `main.tsx` modules, `setImmediate`, stubbed `idb` callback). **None in a file added in 5C-2 or on a line edited in `App.tsx`.** Not a real type check of the React code |
| 2026-10-12 | Syntax-only parse of `App.tsx`, `DatasetStatusPanel.tsx`, `PwaStatusViews.tsx`, `useInstallAdvice.ts`, `browserInstallPrompt.ts` | RAN: 0 syntax diagnostics |
| 2026-10-12 | `npm run verify:scaffold` | RAN: 14/14 static checks (not a build or test result) |
| 2026-10-12 | Defect found by the new tests | None in the code under test. A test-helper bug (comment stripper treated the `/*` inside a glob string as a comment) was fixed in the test |
| — | Project `npm install`, `npm run typecheck`, `npm run build`, `npm test` (real Vitest), `npm run preview` | NOT RUN (no network, no `node_modules` in this sandbox) |
| — | Browser rendering of the More-tab panels and Dashboard row; `beforeinstallprompt` on Chromium; iOS wording on a device; Cache Storage contents | NOT RUN |

## Chunk 5C-3 evidence (fix age, skipped alert thresholds)
| Date | Command / activity | Result |
|---|---|---|
| 2026-10-12 | New tests via `tsx --test` + **Vitest API shim (not real Vitest; written for this session, lives only in a temporary `node_modules/vitest` that is removed before packaging)** | RAN: 21 new tests, 21 pass (fix-age 8, alerts +8, monitoring +5) |
| 2026-10-12 | Whole suite via the same shim | RAN: **406 tests, 405 pass, 1 not run** (`log-store-idb.test.ts`: `fake-indexeddb` not installed). 385 previous + 21 new = 406. Real `npm test`: NOT RUN (expect 406) |
| 2026-10-12 | Mutation check of 5C-3 logic | RAN: 5 injected defects. 4 detected at once; "list replaced instead of accumulated" **survived** and exposed a test gap, so an accumulation test was added and the defect is now detected. Sources restored and diffed afterwards |
| 2026-10-12 | Strict `tsc` (sandbox TS 6.0.3, project flags, sandbox-only stubs for `vitest` and `node:*`) over `src/domain/index.ts`, `monitoring.ts` and the four changed/new test files | RAN: exit 0, 0 errors. Not the project `typecheck` (real packages absent; `App.tsx`, React and Leaflet types not checked) |
| 2026-10-12 | Syntax-only parse of `App.tsx` | RAN: 0 syntax diagnostics |
| 2026-10-12 | Defects found by the new tests | None in the scheduler's firing rules. One test gap (accumulation) found by mutation, fixed in the tests |
| — | Project `npm install`, `npm run typecheck`, `npm run build`, `npm test` (real Vitest), `npm run preview`, `npm run verify:scaffold` | NOT RUN in this session (no network, no project `node_modules`) |
| — | Browser rendering of the Fix age and Skipped alerts rows on desktop and phone | NOT RUN |

## Chunk 5C-4 evidence (phone checklist, version label, acceptance table)
| Date | Command / activity | Result |
|---|---|---|
| 2026-10-12 | Added `docs/KOS/13-phone-test-checklist.md` (7 sections, 41 rows) | WRITTEN: every row NOT RUN. It is a procedure, not evidence |
| 2026-10-12 | `package.json` and the two root entries of `package-lock.json` set to 0.5.0 | DONE; both files parse as JSON. `npm install` NOT RUN, so the lockfile was not regenerated |
| 2026-10-12 | `npm run verify:scaffold` (now also requires KOS 13 to exist) | RAN: 14/14 static checks (not a build, typecheck or test result) |
| 2026-10-12 | Headless-Chromium run of the real app source bundled with stand-ins for `idb`, `leaflet`, `workbox-window` (5C-3 preview) | RAN: no page errors; Dashboard (Fix age, Skipped alerts with a 1240/10 plan giving a 26-min lead) and More tab rendered at 390 px. Stubs mean this says nothing about maps, IndexedDB, service worker, install or GPS |
| 2026-10-12 | Test suite in 5C-4 | NOT RE-RUN — no source file under `src/` or `tests/` changed in this chunk. Last run: 5C-3, shim, 406 tests / 405 pass / 1 not run (`fake-indexeddb`) |
| — | Project `npm install`, `npm run typecheck`, `npm run build`, `npm test` (real Vitest) after 5A…5C-4 | NOT RUN (no network, no `node_modules` here). The TSX files from 5B/5C have never been through a real typecheck |
| — | Every row of KOS 13 | NOT RUN |

## Chunk 6 evidence (e2e specs, hardening checks, release-readiness review)
Sandbox again had **no network and no `node_modules`**: real `npm install`, `npm run typecheck`, `npm test`, `npm run build`, `npm audit` and the Playwright run were all **NOT RUN**. Everything marked RAN below was run with tools that exist in the sandbox and says so.
| Date | Command / activity | Result |
|---|---|---|
| 2026-10-12 | `node scripts/verify-scaffold.mjs` (before and after the chunk 6 edits) | RAN: 14/14 static checks (not a build, typecheck or test result) |
| 2026-10-12 | Strict `tsc` (sandbox TypeScript **6.0.3**; project pins ^5.6.3) over `src/domain`, `src/application`, `src/shared`, flags mirror `tsconfig.json`, no third-party types needed | RAN: exit 0, no errors. Does NOT cover `src/infrastructure`, `src/features`, `src/app`, `src/sw.ts` or `tests/` (their packages are not installed) |
| 2026-10-12 | All `tests/unit` + `tests/integration` through a new throwaway **Vitest-API shim over `node:test`** (outside the repo; TypeScript compiled with TS 6.0.3 `transpileModule`; same approach as chunks 2–5, **not real Vitest**) | RAN: **411 tests, 410 pass, 1 not run**. The one failure is `log-store-idb.test.ts`: `fake-indexeddb` is not installed (`ERR_MODULE_NOT_FOUND`) so it never executed; it says nothing about the code. Per file: alerts 24, architecture 6, changeover-log 23, continuity 10, csv-export 14, dataset-status 26, eta 34, fix-age 8, geospatial 25, install-advice 13, log-time-input 4, planner 16, pwa-status 25, regulations 27, units-position 18, **contrast 5 (new)**; adapters 37, changeover-log-service 13, install-prompt 13, layering 8, log-store 5, monitoring 21, precache-scope 10, pwa-registrar 25. Expected on real Vitest: 411 (406 + 5 contrast) |
| 2026-10-12 | Shim gap found and fixed in the shim, not in the repo: `expect.stringMatching` nested inside `toEqual` (one `adapters` test) | Shim-only; with it fixed that test passes. A reminder the shim can disagree with real Vitest (R-017) |
| 2026-10-12 | Negative test of the new `tests/unit/contrast.test.ts` against the ORIGINAL `tokens.css`/`base.css` from the chunk 5C-4 zip | RAN: 3 of 5 tests fail on the original CSS, all 5 pass on the fixed CSS |
| 2026-10-12 | Contrast arithmetic (WCAG 2.x) on the design tokens | RAN: see "Defect found in chunk 6" below |
| 2026-10-12 | Lockfile analysis of `package-lock.json` (as last regenerated in chunk 4; root entry hand-edited since) | RAN: 581 packages, **161 reach the non-dev graph**, 420 dev-only. `@turf/turf` and its ~130 sub-packages are in the non-dev graph, but no file in `src/` imports `@turf/*` |
| 2026-10-12 | `npm audit` (the 6 advisories: 3 moderate, 1 high, 2 critical from chunk 4) | **NOT RUN — no registry access.** Which advisory belongs to which package is UNKNOWN here; none was remediated or dismissed |
| 2026-10-12 | `tests/e2e/*.spec.ts` (10 tests, 4 files) + `playwright.config.ts` | WRITTEN, **NEVER RUN against the app** (the app cannot be built here). See "e2e specs" below |
| 2026-10-12 | Strict `tsc` over `tests/e2e` + `playwright.config.ts` against the sandbox's real Playwright 1.56.0 types (`node:fs` stubbed) | RAN: exit 0. Checks API usage only |
| 2026-10-12 | Dataset test files and alert scenarios, run through the REAL `parseDatasetFromGeoJson`, `describeDatasetStatus`, `SimulatorPositionProvider` and `MonitoringController` (manual scheduler) | RAN: see "e2e specs" below |
| 2026-10-12 | Playwright clock mechanics on a throwaway page (not the app): `clock.install` → `pauseAt` → `runFor` in 9 s steps | RAN: 345 s of page time produced 191 interval firings of 1.8 s (expected 191); clock stayed paused while idle. Proves the helper approach, not the app |
| — | Real `npm install` / `typecheck` / `build` / `npm test` / `npm run test:e2e` after 5A…6 | **NOT RUN** |
| — | Every row of KOS 13 (real phones) | **NOT RUN** |

### Defect found in chunk 6: muted text below WCAG AA (R-039)
`--ink-500` (#5d7b93) was used as TEXT colour for `.muted`, `.metrics dt` (every Dashboard row label), the header subtitle and the inactive nav labels. Measured contrast: **3.64:1 on the panel surface (`--ink-800`), 4.18:1 on the app background (`--ink-900`), 2.93:1 on raised surfaces (`--ink-700`)** — all below the 4.5:1 AA minimum for normal text. Fix: new token `--ink-300` (#9db4c6: 8.65 / 7.54 / 6.08 : 1 on 900 / 800 / 700) for text; `--ink-500` kept for borders only (4.18:1 on the app background, above the 3:1 UI-component minimum). Guarded by `tests/unit/contrast.test.ts`. Other pairs in use measured fine: primary text 11.6–16.6:1; tide 5.4–7.7; amber 6.5–9.3; violet 4.9–6.9; alarm 4.9–5.6 on 900/800 (3.92 on 700, not used as text there as far as the CSS shows). **Still NOT RUN:** how it looks on a phone in low light, and how rows wrap at small widths (R-039 stays PARTIALLY MITIGATED).

### e2e specs (written, not run)
Runner: Playwright (ADR-044). **Headless desktop Chromium; not a phone, not iOS Safari, not a real GPS.** They drive the built app (`npm run test:e2e` = build, then `vite preview` on 127.0.0.1:4173) in Route replay mode with a controllable page clock, because the replay advances only ~5.6× real time (one fix per 1.8 s, 10 simulated seconds each) and the boundary is 1276.7 simulated minutes away.
| Spec | What it would check |
|---|---|
| `dashboard-plan-alerts` (4) | SIMULATED badge + demo banner + fix age + boundary distance; Plan entry labelled "NOT a FOBAS result"; 60 → 30 → start-overdue alerts appear in order (via the Log tab's *Acknowledge* buttons) with *Skipped alerts* = None; a close first plan shows "60-min alert skipped: already passed…" |
| `log-csv` (1) | create → confirm start → confirm completion (human-confirmed only) → CSV download has `provenance` + `data_notice` columns and a SIMULATED row → entry survives reload |
| `dataset-status` (4) | SYNTHETIC (bundled file), UNVERIFIED test file (warning, ETA still on), EXPIRED-by-flag and EXPIRED-by-date test files (NOT USED, ETA unavailable) via `page.route()`; app code unchanged |
| `offline` (1) | real service worker → "Offline ready" → network off → reload → app, demo data and a fix still appear |
Design numbers were derived with the real code (not typed from memory): route to the boundary is **255.34 nm = 1276.7 min at 12 kn**; with duration 1180 + margin 7 the planned start is 89.7 simulated min after the first plan and the controller raised the 60-min alert at replay step 180, 30 at 360, 15 at 450, 5 at 510 and start-overdue at 540; with 1200 + 60 the first plan is 16.7 min from start, the 60-min threshold is recorded `already-passed-at-start` and the 30-min alert is raised. The three dataset test files were run through the real parser and presenter: UNVERIFIED → usable, ETA available; both EXPIRED files → blocked, ETA unavailable.
**Not covered by e2e:** real GPS, notification delivery, install prompt, the map's rendering (tiles are blocked), iOS, update flow, storage eviction, `Copy CSV`. **Risks of the first run:** selectors and timings were written against the source and could be wrong (R-041); `@playwright/test` is not in the lockfile and Chromium must be downloaded (R-042).

### Release gates — restated after chunk 6 (no gate is met)
| Gate | State | What evidence would be needed |
|---|---|---|
| Real-phone tests complete (Android Chrome + iOS Safari, real HTTPS) | **NOT MET** — all 41 KOS 13 rows NOT RUN | A person completes KOS 13 on both devices and records date/device/result per row |
| Real `npm install` / typecheck / test / build green, outputs recorded | **NOT MET** — NOT RUN since chunk 4 | Run on a networked machine (NEXT_STEPS Step 0); paste exact output here |
| e2e specs executed | **NOT MET** — written, never run | `npm run test:e2e` output; fix the specs or the app and log defects |
| `npm audit` triaged (6 advisories) | **NOT MET** — not run this chunk, not remediated | `npm audit --json`; for each advisory record package, dev-only vs shipped (compare with the non-dev list from the lockfile), fix or accept with a reason |
| Authorised FOBAS method, or an explicit manual-only policy | **NOT MET** — FOBAS UNKNOWN; duration is manual-verified | Owner decision recorded as an ADR |
| Verified boundary geometry with licence | **NOT MET** — all geography synthetic | Licensed dataset with source, version, effective dates, review record |
| Review by a qualified marine engineer | **NOT MET** — no review happened (alert defaults R-024) | Written review |
| All risks in 08 triaged | **PARTIAL** — each of R-001…R-044 has a recorded state in 08 (chunk 6 review) but most rest on code reading, fakes or the shim | Re-triage after the real runs and phone checklist |
| KOS current | MET for chunk 6 content; goes stale as soon as the real runs are done | — |
