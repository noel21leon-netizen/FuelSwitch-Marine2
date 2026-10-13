# NEXT STEPS — after chunk 6 (version label still 0.5.0)

All six chunks are now written. **Nothing is released and nothing has been run on a phone.** Chunk 6 added e2e specs, a contrast fix, hardening checks and a risk/gate review; the e2e specs have **never been run** and real `typecheck` / `build` / `npm test` have not run since chunk 4.

| Part | Scope | Status |
|---|---|---|
| 1–4 | Scaffold, domain, adapters + monitoring, application + UI | DONE (real typecheck/test/build ran once, chunk 4) |
| 5A–5C-4 | Log + CSV, SW registration, dataset status, install help, fix age + skipped alerts, phone checklist | DONE (sandbox-tested only) |
| **6** | **e2e specs, hardening checks, release-readiness review, final report (KOS 14)** | **WRITTEN — e2e never run; `npm audit` not run; no gate met** |

## Step 0 — run the real checks (nobody has run these since chunk 4)
```bash
cd fuelswitch-marine
npm install                         # regenerates package-lock.json (root entry hand-edited to 0.5.0; @playwright/test is NOT in it yet — R-042)
npm run typecheck                   # FIRST real typecheck of everything from 5B…6 (infrastructure, features, App.tsx, tests incl. tests/e2e). Fix what it reports.
npm test                            # expect 411 tests: 406 + 5 in tests/unit/contrast.test.ts (incl. the fake-indexeddb test)
npm run build                       # must emit dist/sw.js
npm run verify:scaffold             # 14/14 expected
npx playwright install chromium     # once
npm run test:e2e                    # builds, then runs 10 specs in headless desktop Chromium — FIRST EVER RUN (R-041)
npm audit --json                    # the 6 advisories (3 moderate, 1 high, 2 critical) are untriaged (R-044)
```
Record the exact output in `docs/KOS/11-release-readiness.md`. If something fails, fix the code or the spec (not the expectation without a reason) and log the defect. Likely first-run trouble in the e2e specs: a selector or wording mismatch, or timing around `page.clock.runFor`. `support.ts` documents the numbers they rely on (255.34 nm = 1276.7 simulated minutes to the boundary at 12 kn; plan 1180 + 7 → alerts at replay steps 180/360/450/510/540). If the controller changes, those numbers change.

## Step 1 — audit triage (R-044) and dependency hygiene (R-043)
- For each advisory record: package, severity, **dev-only vs shipped**. The lockfile (as of chunk 4) has 161 non-dev and 420 dev-only packages; the non-dev part is `@turf/*` (≈130), `idb`, `leaflet`, `react`, `react-dom`, `scheduler`, `workbox-*`, and a few helpers (full list in KOS 11 evidence). Do not dismiss any without a recorded reason.
- `@turf/turf` is declared but never imported by `src/`. Decide: `npm uninstall @turf/turf` (the layering tests only list it as a forbidden import, so they stay valid) or record why it stays.

## Step 2 — phone checklist
Work through `docs/KOS/13-phone-test-checklist.md` on a real Android phone (Chrome) and a real iPhone (Safari) over real HTTPS. Every row is NOT RUN until a person does it; record date, device, result and notes, then copy outcomes into KOS 11 (acceptance table) and open risks for anything that fails. Judge the readability rows against the new `--ink-300` text colour.

## Step 3 — the release gates (none met; KOS 11 lists the evidence each needs)
Real-phone tests · real toolchain green · e2e executed · audit triaged · authorised FOBAS method or explicit manual-only policy · verified geometry with licence · qualified marine engineer review · risks triaged · KOS current.

## Known open items (carried and new)
- 6 npm audit advisories (3 moderate, 1 high, 2 critical) from chunk 4: **not triaged, not remediated** (R-044).
- e2e specs: written, typechecked against Playwright 1.56 types, **never run** (R-041). They are desktop headless Chromium and never count as phone evidence. Not covered: real GPS, notification delivery, install prompt, update flow, map rendering (tiles blocked), iOS, storage eviction, Copy CSV.
- `@playwright/test` is in `package.json` but not in the lockfile (R-042).
- Browser rendering on real devices, IndexedDB reload, tile/offline behaviour, service-worker registration/update, install prompt, GPS, notification permission and file download: NOT RUN (checklist KOS 13).
- Map tiles are never cached (no runtime caching in `sw.ts`; pinned by `precache-scope.test.ts`).
- Dataset status is metadata-based and judged on the controller's clock, which is simulated while replaying (R-033). Install help is unverified on real browsers (R-034). A cached build serves its bundled dataset until updated (R-036).
- The skipped-threshold list is session-only (R-038) and keyed to the first *usable plan* (R-037). Muted text contrast was measured and fixed (R-039, ADR-045); its look on a phone in low light is unchecked.
- FOBAS method and benchmarks: UNKNOWN — duration stays manual-verified.
- All geography is synthetic. Log is device-local: clearing site data deletes it (R-029). An update reload restarts live monitoring and clears the session alert and skipped lists (R-030).
- Test runner note: unit/integration tests have only been run on a `node:test` shim of Vitest since chunk 4 (R-017). One shim gap was found in chunk 6; the shim is not part of the repo.
- No vessel-profile screen was built (`features/vessel-profile` is a placeholder).
