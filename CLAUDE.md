# CLAUDE.md — FuelSwitch Marine (persistent instructions)

Product: **FuelSwitch Marine** · Feature: **ECA Changeover Assistant**. Do not rename. Phone-first installable PWA is the primary deliverable.
Advisory prototype only: never operate fuel equipment, never claim compliance, certification or validated FOBAS output.

## Every task
1. Read this file, `NEXT_STEPS.md` and `docs/KOS/` (start with `00-system-overview.md`, `02-requirements.md`) and inspect the repo before editing.
2. State which requirement IDs / KOS sections the task touches.
3. Preserve existing content; never overwrite the project or KOS wholesale.
4. Keep domain logic (distance, time, route, crossing, planner, regulatory rules) in `src/domain` as pure TypeScript — no React, DOM, Leaflet, IndexedDB there. UI never contains formulas.
5. Browser GPS, simulator, notifications, map, persistence and datasets go through adapters/ports in `src/infrastructure`.
6. Label data status: `VERIFIED` / `PROPOSED` / `UNKNOWN` / `SIMULATED` / `EXPIRED`. Never promote PROPOSED/SIMULATED to VERIFIED silently.
7. Synthetic data must show: "DEMO DATA — NOT FOR NAVIGATION OR REGULATORY COMPLIANCE" (use `src/shared/constants.ts`). Simulation must show SIMULATED.
8. Never invent the FOBAS formula, parameters or benchmarks. Duration is manual-verified and labelled as such.
9. Do not fabricate GPS, SOG, COG or coordinates. Missing/stale/invalid input → "unavailable" with a reason, never a made-up number.
10. Do not imply continuous background GPS; a service worker does not track location.
11. Document assumptions and decisions (append ADRs in `docs/KOS/09-architecture-decisions.md`); update KOS + `CHANGELOG.md` after each task.
12. Run the commands that exist (`npm run typecheck`, `npm test`, `npm run build`, `npm run verify:scaffold`). **Never report a test or build as passing unless it actually ran.** If it could not run, write NOT RUN and why.
13. No backend, accounts, paid APIs or secrets in client code unless necessary and documented.

## Commands
`npm install` · `npm run dev` · `npm run dev:https` · `npm run typecheck` · `npm test` · `npm run build` · `npm run preview` · `npm run verify:scaffold` · `npm run test:e2e` (builds, then Playwright; needs `npx playwright install chromium` once)
There is no `lint` script (ADR-011).

## Testing honesty (added chunk 2)
- Say **which runner** produced a result. Chunk-2 and chunk-3 tests were run on a `node:test` shim of Vitest in an offline sandbox, adapters with fakes only; real `npm test` is NOT RUN until you record it in `docs/KOS/11-release-readiness.md`.
- Domain functions never read the clock — inject `nowUtc`. Domain test fixtures are hand-derivable (1° = 60.0405 nm); do not derive expected values by calling the code under test.
- When a test exposes a defect, fix the code (not the expectation) and record it in `11-release-readiness.md`.

- Chunk 3: `src/application` and `src/infrastructure` never read the clock or touch the UI; time is injected (`MonitoringController` clock; simulator mode uses `simulatedNowUtc`). A notification or GPS adapter result is never reported as working until tested on a real device.

- Chunk 5A: the changeover log records only what a human confirms (ADR-029). Never add code that sets actual start/completion from GPS, the simulator, or the planned time. CSV export must keep the `provenance` and `data_notice` columns (ADR-030). Chunk 5 is delivered as 5A/5B/5C (ADR-031); see `NEXT_STEPS.md`.

- Chunk 5B: log persistence goes through `LogStore` (ADR-032); the service must report failed saves (ADR-033). Corrupt stored records are counted and shown, never silently dropped. Do not import `idb` from `logStore.ts` (keeps the store logic browser-free).

- Chunk 5C-1: the service worker is registered only through `ServiceWorkerRegistrar` (ADR-034); only `browserServiceWorker.ts` imports `workbox-window`. A service-worker update is applied only when the user taps (ADR-035): never auto-reload, never call `clientsClaim()`. "Offline ready" means the worker finished installing, not that an offline test passed. Chunk 5C is delivered as 5C-1…5C-4 (ADR-036); see `NEXT_STEPS.md`.

- Chunk 5C-2: dataset status is shown only through `describeDatasetStatus` (ADR-037), which reuses `evaluateDatasetUsability`; never re-implement the date rules in the UI and never show EXPIRED or UNVERIFIED data as plain current data. Install help goes through `installAdvice` and `InstallPromptPort` (ADR-038): never promise an install prompt exists everywhere, and "available" means the browser event is actually held. `sw.ts` must stay precache-only (ADR-039; `precache-scope.test.ts` fails if a runtime route, fetch handler or `clientsClaim()` is added).

- Chunk 5C-3: fix age is shown only through `describeFixAge` and skipped alert thresholds only through the scheduler's `skippedDetail` (ADR-040…042); never compute age or decide a skip reason in the UI or controller, and never show an age number without a valid fix. The skipped list is session-only.

- Chunk 5C-4: `docs/KOS/13-phone-test-checklist.md` rows stay NOT RUN until a person actually does them on a real phone; never mark one PASS from code reading, a headless browser or a stubbed preview. Version 0.5.0 is a label for the end of chunk 5, not a release (R-040).

- Chunk 6: e2e specs live in `tests/e2e/*.spec.ts` (ADR-044) and drive the built app in replay mode with a controlled page clock. Always call them *headless desktop Chromium*, never phone evidence; they stay NOT RUN until `npm run test:e2e` has actually been run and its output recorded in KOS 11. Secondary TEXT uses `--ink-300` only; `--ink-500` is for borders (ADR-045, `contrast.test.ts`). Never mark a release gate met without evidence, and never mark a risk CLOSED from code reading, fakes, the shim or a headless browser (KOS 08, chunk 6 review).

- GPS reliability (ADR-048): GPS wording for the user comes only from `describeGpsState`; the provider's restarts and retries never emit or invent a position (a restart just lets the last fix age into STALE), never retry permission-denied, and never imply background tracking. Retry/watchdog behaviour on a real phone is NOT RUN until KOS 13 P-26…P-29 are done by a person.

- Home Screen wording (ADR-049): the iPhone Home Screen message comes only from `describeGpsState` (needs the `standalone` flag from the install environment); never show browser-settings steps or a retry button there, and never state as fact that Home Screen apps cannot use GPS until KOS 13 P-64 is done on a real iPhone.
