# FuelSwitch Marine — ECA Changeover Assistant

Phone-first, installable PWA that helps engineers plan fuel changeover before an ECA boundary.
**Advisory prototype. Not an approved navigation system. Never operates fuel equipment. No compliance claim.**
All map data in this repo is **synthetic**: *DEMO DATA — NOT FOR NAVIGATION OR REGULATORY COMPLIANCE*.

## Status: chunk 6 written (version 0.5.0 — a prototype label, not a release; the e2e specs have never been run)
Implemented: pure domain and monitoring layers, browser GPS/simulator/notification adapters, dashboard and planner UI, Leaflet map overlays, and IndexedDB persistence for settings. The bundled boundary and route are synthetic. This is an advisory prototype; real GPS, browser rendering, notification behavior and phone installation have not been validated.

Chunk 5 progress: 5A/5B (human-confirmed log, IndexedDB persistence, CSV export), 5C-1 (service-worker registration with visible offline-ready / update-available / failed states) 5C-2 (dataset source/version/status with EXPIRED / UNVERIFIED / unknown-source notices, install help on the More tab, a test that pins the precache scope) 5C-3 (Dashboard fix age with the stale limit, skipped alert thresholds with reasons) and 5C-4 (manual phone checklist in `docs/KOS/13-phone-test-checklist.md`, PWA acceptance table, version label) are written but not yet verified by `npm install`/`typecheck`/`build` on a real machine. Still to do: run the real install/typecheck/test/build, work through the phone checklist (every row is NOT RUN), then chunk 6 (integration/e2e tests, hardening, release-readiness review). FOBAS method and operational boundary data remain UNKNOWN/unverified.

Verification (as of chunk 4, the last time the real toolchain ran; chunks 5–6 are NOT RUN against it): strict TypeScript check passed; real Vitest passed 213/213 tests; production Vite/PWA build passed; static scaffold checks passed 14/14. See `docs/KOS/11-release-readiness.md` for evidence and outstanding checks. `npm install` reported 6 audit advisories (3 moderate, 1 high, 2 critical); they have not been remediated.

## Commands (Node 18+; Node 20/22 recommended)
```bash
npm install                 # installs dependencies from package-lock.json
npm run verify:scaffold     # dependency-free static checks
npm run typecheck           # tsc strict, 3 configs
npm run dev                 # http://localhost:5173 (LAN too, via --host)
npm run build               # typecheck + production build to dist/
npm run preview             # serve dist/ to test the built PWA + service worker
npm test                    # Vitest — unit/integration tests (expect 411 after chunk 6: 406 + 5 contrast tests; see KOS 11)
npx playwright install chromium   # once, before the first e2e run
npm run test:e2e            # build, then Playwright e2e in headless desktop Chromium (NOT a phone; specs never run yet, KOS 11)
```

## Testing on a phone
Geolocation, service workers and installation need **HTTPS** (localhost is exempt on the same machine only).
1. Build: `npm run build`.
2. Deploy `dist/` to a static HTTPS host or serve it through an HTTPS tunnel.
3. Open the URL on the phone, then use the browser's install / "Add to Home Screen".
`npm run dev:https` uses a self-signed certificate and is intended for quick desktop/LAN checks. See KOS release readiness for current NOT RUN phone checks.

## Repo map
`docs/KOS/` source of truth · `src/domain` pure logic · `src/infrastructure` adapters · `src/features` UI ·
`public/` manifest, icons, synthetic data · `scripts/` verification. See `CLAUDE.md` for working rules.
