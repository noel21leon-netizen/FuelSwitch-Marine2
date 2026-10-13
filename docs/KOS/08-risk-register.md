# 08 — Risk Register

Owner = TBD (to be assigned by project owner). Severity: H/M/L. All mitigations PROPOSED.

| ID | Risk | Sev | Mitigation | Status |
|---|---|---|---|---|
| R-001 | User treats prototype output as compliance evidence | H | Advisory text everywhere; no "compliant" wording; manual-verified labels; release gates | OPEN |
| R-002 | Synthetic geometry mistaken for real ECA | H | DEMO banner, fictional ocean location, `synthetic` status gating | OPEN |
| R-003 | PWA suspended/closed → GPS and alerts stop | H | Explicit UI limit text; keep-open guidance; evaluate Wake Lock; real-device tests; native only if proven needed | OPEN |
| R-004 | iOS web notification prerequisites/limits (may need installed PWA) | M | Feature-detect; document; test on real iPhone. Detail UNKNOWN until SRC-05 reviewed | OPEN |
| R-005 | Stale cached data shown as current | H | No runtime caching of production data; dataset status UI; SW tests | OPEN |
| R-006 | FOBAS formula/benchmarks unavailable | M | Manual-verified duration only; interface ready for later engine | OPEN |
| R-007 | Phone GPS poor in steel structures / low SOG noise | M | Accuracy/stale gating; ETA unavailable instead of guessing | OPEN |
| R-008 | Chunk-1 code never built/tested (no network in sandbox) | M | Run `npm install && npm run build && npm test` and report; fix before chunk 2 depends on it | OPEN |
| R-009 | Service-worker update traps users on old version | M | Prompt-based update, visible version/status (chunk 5) | OPEN |
| R-010 | Wrong device clock distorts ETA/log times | M | Use fix timestamps; warn on large clock/fix disagreement; UTC storage | OPEN |
| R-011 | Spherical vs ellipsoidal distance error | L | Quantify in tests/calc spec; document tolerance | OPEN |
| R-012 | Antimeridian / polar geometry errors | L | Explicit validation and tests before real data | OPEN |
| R-013 | Map tiles unavailable offline | M | Overlay-only fallback view; label "basemap offline" | OPEN |
| R-014 | SOx changeover misread as NOx compliance | M | Separate module, wording, tests | OPEN |
| R-015 | Location logs are sensitive data | M | Local-only storage; export is user-initiated; privacy note | OPEN |
| R-016 | Dependency versions in package.json unverified | M | First install may resolve differently; commit lockfile after verified build | OPEN |
| R-017 | Domain tests were run on a **sandbox shim** of the Vitest API (node:test), not on real Vitest | M | Run `npm test` on a networked machine and record the result; shim is outside the repo and not shipped | OPEN |
| R-018 | Planar lon/lat intersection + lon/lat-linear legs give unquantified error on very long legs / high latitudes | M | Densify long legs; quantify against geodesic in a test before real geometry (with R-011/R-012) | OPEN |
| R-019 | Projection onto routes that pass near themselves (loops, hairpins) may pick the wrong leg | M | Progress-continuity added in chunk 3 (ADR-024): windowed projection + flagged fallback | PARTIALLY MITIGATED — tested on a synthetic hairpin only; UI must keep passing progress |
| R-020 | Direction sampling (±0.01 nm) mis-classifies features narrower than that | L | Documented limit; real ECA polygons are far larger; add geometry validation threshold with real data | OPEN |
| R-021 | Chunk 1 shipped literal `{a,b}` directories (shell brace-expansion bug) — structure was silently wrong | L | FIXED in chunk 2; `verify:scaffold` now fails on brace-named dirs (negative-tested) | CLOSED |
| R-022 | Continuity window (−2/+25 nm, tolerance = off-route setting) is untested on real routes/speeds; a fast vessel with long gaps between fixes could trip the fallback often, a loop narrower than the tolerance could still mis-track | M | Tune with real route data and fix rates; surface `global-fallback` warning in the UI (chunk 4) | OPEN |
| R-023 | Notifications: Android Chrome needs a service-worker registration for `showNotification` but the SW is only registered in chunk 5; iOS needs an installed PWA (R-004). Delivery and the fallback path are tested with fakes only | M | In-app alert always shown; real-device test (chunk 5/6); never describe notifications as reliable | OPEN |
| R-024 | Alert rules (closest-only on first sight, 2-min re-arm, 60/30/15/5) are engineering defaults not validated with engineers; a skipped alert could be missed | L | User-configurable thresholds; review with a marine engineer before any trial | OPEN |
| R-025 | Integration tests use fakes: real `watchPosition` behaviour (accuracy, null speed, permission prompts, background suspension) is unverified | M | Real-phone checklist (chunk 5); keep the UI honest about foreground-only tracking | OPEN |
| R-026 | Log entries are human-typed: a wrong or back-dated time is accepted if plausible (only future times and completion-before-start are rejected). The log is a record of what the person said, not evidence | M | Provenance column says MANUAL; overrides keep previous value + reason; never describe the log as verified | OPEN |
| R-027 | CSV opened in a spreadsheet: formula-injection neutralisation prefixes `'` to text cells, which some apps display | L | Documented; numeric cells unaffected; review exports before sharing | OPEN |
| R-028 | Log UI (`ChangeoverLogPanel`) and the App wiring are typechecked only by syntax parse in the sandbox (no React/Vite types) and never rendered; datetime-local behaviour differs across mobile browsers (esp. iOS Safari) | M | Run `npm run typecheck`/`build` locally; manual phone checklist in 5C; keep "leave empty = now" path | OPEN |
| R-029 | Entries are device-local in IndexedDB; clearing site data or uninstalling the PWA deletes the log. Export is the only backup | M | Export button; tell users to export before clearing data; consider reminders in 5C | OPEN |
| R-030 | Applying a service-worker update reloads the page: live monitoring restarts, the simulator replay starts again and the in-memory session alert list is cleared. A user could tap Update at a bad moment | M | Update is never automatic; warning text shown next to the button; settings and saved log entries persist; consider hiding the button while an alert threshold is imminent (not done) | OPEN |
| R-031 | "Offline ready" is derived from worker install events, not from an offline test. It could overstate readiness (e.g. storage evicted by the browser, iOS cache limits). Map tiles are never cached | M | Wording states tiles are not cached and tells the user to check by reloading offline; phone checklist (5C-4) must record real results; never report it as tested | OPEN |
| R-032 | `browserServiceWorker.ts` (workbox-window wrapper), `PwaStatusViews.tsx` and the App wiring are typechecked only against sandbox stubs / syntax-parsed and never run in a browser | M | Run `npm run typecheck`, `npm run build`, `npm run preview` locally and fix reported errors; record in 11 | OPEN |
| R-033 | The dataset status label comes from the dataset file's own metadata and dates. A file that wrongly declares `verified` would show VERIFIED; the app cannot check it. While replaying, expiry is judged on the simulated clock (same as ETA gating) | M | Wording says status is metadata-based and the app cannot verify (`DATASET_STATUS_BASIS_TEXT`); More tab prints the assessment time and which clock; real datasets need the human review workflow in KOS 07 before `verified` | OPEN |
| R-034 | Install help depends on Chromium's `beforeinstallprompt` (not fired in Safari/Firefox, and only when installable) and on user-agent / platform heuristics for iOS (incl. iPadOS reporting as a touch-capable Mac). Display-mode changes after load are not observed. Never run on a real phone | M | Text avoids promises and says the browser decides; iOS shows manual steps only; phone checklist (5C-4) must record real results per browser | OPEN |
| R-035 | The precache-scope test is text matching of `vite.config.ts` and `src/sw.ts`. A runtime cache added through an imported helper or a differently-written call could evade it, and no real Cache Storage is inspected | L | Test also bans other workbox modules and any `fetch` handler; phone checklist (5C-4) should list Cache Storage in DevTools and confirm only precache entries | OPEN |
| R-036 | An installed/cached build keeps serving its bundled dataset until the user applies an update; for a future real dataset an outdated boundary could stay on the device. Only effective dates (if recorded) would flag it | M | Not relevant to the synthetic data shipped now; before any real dataset: require `effectiveTo`, show source/version/reviewed date (done in 5C-2), and surface an "update available" reminder | OPEN |
| R-037 | "Already passed when the first usable plan was calculated" is keyed to the first valid plan of the session, not to the moment monitoring started. If a plan is unavailable for a while (no margin or duration entered, no fix), thresholds that passed in that time are reported as already passed on first sight, which is accurate about what the app saw but not about when the user started | L | Wording says *first usable plan*; reason is shown with each skip; no alert is ever back-filled | OPEN |
| R-038 | The skipped-threshold list is session memory only: it is cleared by page reload, update reload (extends R-030) or a restart, and then rebuilt from the new session's first plan. A reviewer could read an empty list as "no alert was ever skipped" | L | Dashboard says *None this session*; list is not written to the changeover log or CSV | OPEN |
| R-039 | The new Dashboard rows (Fix age text, Skipped alerts) are wired in `App.tsx`, which was only syntax-parsed here; their rendering, wrapping on a small phone and readability in low light were never seen in a browser | L | Manual check in NEXT_STEPS (5C-3 section); NFR-008 text-not-colour is met by wording only | PARTIALLY MITIGATED (chunk 6) — the muted text measured 3.64:1 (below AA) and was fixed (ADR-045, `contrast.test.ts`); how the rows look and wrap on a phone, in low light, is still NOT RUN |
| R-040 | Version 0.5.0 and a long evidence log could be read as "phone-tested" or "ready". The checklist (KOS 13) is entirely NOT RUN, real typecheck/build/test have not been run since chunk 4, and every release gate is unmet | M | KOS 11 header and acceptance table state NOT RUN per row; README says prototype; first action of the next chunk is the real `npm install/typecheck/test/build` and the phone checklist | OPEN |
| R-041 | The chunk 6 e2e specs (`tests/e2e`) have never been executed: a selector, wording or timing assumption could be wrong, and a green run would only mean headless desktop Chromium in replay mode, not a phone | M | Clock mechanics, dataset fixtures and alert numbers were checked against real code and a throwaway page; the specs typecheck against Playwright 1.56. First action: `npm run test:e2e`, fix spec or app, log each defect in KOS 11. Always label results *desktop headless* | OPEN |
| R-042 | `@playwright/test` was added to `package.json` but not to `package-lock.json` (no registry offline), and Chromium has to be downloaded; `npm ci` will refuse an out-of-sync lockfile | L | Run `npm install` to regenerate the lockfile and commit it; then `npx playwright install chromium` | OPEN |
| R-043 | `@turf/turf` is a production dependency (≈130 packages in the non-dev part of the lockfile) but no file in `src/` imports it. It widens the audit surface and the install size for nothing | L | Owner decision: remove it with `npm uninstall @turf/turf` on a networked machine (layering tests only mention it as a forbidden import, so they stay valid), or record why it is kept for later geometry work (ADR) | OPEN |
| R-044 | The 6 `npm audit` advisories from chunk 4 (3 moderate, 1 high, 2 critical) are not triaged: `npm audit` could not run in chunk 6 and the affected packages are unknown here | M | Run `npm audit --json`; for each advisory record package, dev-only vs shipped (compare with the lockfile's non-dev list in KOS 11), fix or accept with a reason; never dismiss without a record | OPEN |
| R-045 | Automatic GPS restarts (ADR-048) are untested on real phones: the 45 s silent-stall restart or the restart after an error could cause repeated permission prompts, extra battery use, or flicker between states on iOS Safari or the installed app; the iPhone Settings wording may not match the iOS version | M | Options can be tuned or switched off; permission denied is never auto-retried; KOS 13 rows P-26…P-29 (all NOT RUN) record what actually happens | OPEN |
| R-046 | The iPhone Home Screen wording (ADR-049) is unverified: it is not known on a real iPhone whether a Home Screen app can use GPS, nor whether the standalone detection fires, nor whether the browser fallback works for the person | L | KOS 13 row P-64 (NOT RUN) records what the iPhone shows; wording says "may not allow" rather than stating a fact | OPEN |

## Chunk 6 review of R-001…R-044 (2026-10-12)
Method: each risk re-read against the repository and the chunk 6 evidence in KOS 11. "OPEN" means the mitigation is a design/wording measure that has not been proven on a device or with the real toolchain. **No risk is CLOSED on the strength of code reading, fakes, the shim or a headless browser.** A shim result is *not* real Vitest (R-017).
| ID | State after review | Evidence / what is still missing |
|---|---|---|
| R-001 | OPEN | Advisory and DEMO wording is in constants and the app; e2e asserts it (not run). No owner/engineer review |
| R-002 | OPEN | `synthetic` gating and DEMO notice tested (`regulations`, `dataset-status`: pass on shim); e2e SYNTHETIC check not run |
| R-003 | OPEN | Wording only; Wake Lock not evaluated; KOS 13 NOT RUN |
| R-004 | OPEN | iOS behaviour UNKNOWN; KOS 13 NOT RUN |
| R-005 | OPEN | `precache-scope` test passes on shim (source text only); no real Cache Storage inspected; offline e2e written, not run |
| R-006 | OPEN | Unchanged: FOBAS UNKNOWN, manual duration only (e2e checks the "NOT a FOBAS result" label; not run) |
| R-007 | OPEN | Accuracy/stale gating unit-tested; no real GPS |
| R-008 | OPEN | Real build last ran in chunk 4; not run in chunks 5–6 |
| R-009 | OPEN | Prompt-based update tested with fakes (`pwa-registrar`, `pwa-status`: pass on shim); never in a browser |
| R-010 | OPEN | No new evidence |
| R-011 | OPEN | No new evidence |
| R-012 | OPEN | No new evidence |
| R-013 | OPEN | Overlays do not depend on tiles in the code; tiles never cached; not seen on a device |
| R-014 | OPEN | NOx scope text shown on the More tab; not re-tested on a device |
| R-015 | OPEN | Local-only storage by design; no privacy review |
| R-016 | OPEN | Lockfile exists but its root entry was hand-edited and `@playwright/test` is missing from it (R-042); regenerate |
| R-017 | OPEN | Shim run again: 411 tests, 410 pass, 1 not run; one shim gap found and fixed in the shim. Still not real Vitest |
| R-018 | OPEN | No new evidence |
| R-019 | PARTIALLY MITIGATED | Unchanged: synthetic hairpin only |
| R-020 | OPEN | No new evidence |
| R-021 | CLOSED | `verify:scaffold` 14/14 re-run (includes the brace-directory check, negative-tested in chunk 2) |
| R-022 | OPEN | No new evidence |
| R-023 | OPEN | Fakes only; KOS 13 NOT RUN |
| R-024 | OPEN | Thresholds 60/30/15/5 behaved as designed in the real controller (chunk 6 scenarios) but are engineering defaults with no marine-engineer review |
| R-025 | OPEN | Fakes only |
| R-026 | OPEN | No new evidence |
| R-027 | OPEN | No new evidence |
| R-028 | OPEN | UI files never typechecked for real; e2e written, not run; KOS 13 NOT RUN |
| R-029 | OPEN | Design limit; e2e reload-persistence check not run |
| R-030 | OPEN | Design limit; not run |
| R-031 | OPEN | Offline e2e written, not run; would be desktop only |
| R-032 | OPEN | Not typechecked or run for real |
| R-033 | OPEN | e2e dataset-status specs (SYNTHETIC / UNVERIFIED / EXPIRED ×2) written and their fixtures validated with the real parser and presenter; not run in a browser |
| R-034 | OPEN | Install help never run on real browsers |
| R-035 | OPEN | Source-text test only |
| R-036 | OPEN | Not relevant to synthetic data; blocks any real dataset |
| R-037 | OPEN | Behaviour confirmed with the real controller (skip case 1200+60); wording limit remains |
| R-038 | OPEN | Session-only by design |
| R-039 | PARTIALLY MITIGATED | Contrast defect fixed and test-guarded (ADR-045); phone rendering NOT RUN |
| R-040 | OPEN | Header of KOS 11 and README say NOT RUN / not a release; every gate unmet |
| R-041 | OPEN | New in chunk 6 |
| R-042 | OPEN | New in chunk 6 |
| R-043 | OPEN | New in chunk 6 |
| R-044 | OPEN | New in chunk 6 |
| R-045 | OPEN | New 2026-10-13; nothing tested on a phone |
| R-046 | OPEN | New 2026-10-13; nothing tested on a phone |
Tally: 45 risks — 1 CLOSED (R-021), 2 PARTIALLY MITIGATED (R-019, R-039), 42 OPEN.

