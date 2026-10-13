# 14 — Final Report (end of chunk 6, version label 0.5.0)

Date: 2026-10-12. This is an honest status report on an **advisory prototype**, not a release note.
**No claim of compliance, certification, regulatory validity or validated FOBAS output is made anywhere in this project.** All geography is synthetic.

## What exists
- Phone-first installable PWA (React + TypeScript + Vite) with five tabs: Dashboard, Map, Plan, Log, More.
- Pure domain layer (distance, route progress, boundary crossing, ETA, planner, alert scheduler, dataset usability and status wording, fix age, changeover log, CSV builder) with adapters/ports for GPS, route-replay simulator, notifications, map, IndexedDB, service worker and install prompt.
- Manual-verified changeover duration (the FOBAS method and benchmarks are UNKNOWN and not implemented). Alerts at 60/30/15/5 minutes (PROPOSED defaults) plus start-overdue, with skipped thresholds explained.
- Human-confirmed changeover log with CSV export (SIMULATED / PLANNED / MANUAL provenance), device-local.
- Offline shell via a precache-only service worker; visible offline-ready / update-available / failed states; install help.
- Chunk 6 additions: 10 Playwright e2e specs (written, never run), a contrast regression test, a fix for sub-AA secondary text, risk review R-001…R-044, ADR-044/045.

## What was verified, and how (all in the offline sandbox, KOS 11 has the detail)
| Check | Result | Strength |
|---|---|---|
| `verify:scaffold` | 14/14 | static file/config checks only |
| Strict `tsc` (TypeScript 6.0.3) over `src/domain`, `src/application`, `src/shared` | exit 0 | real compiler, partial scope, version differs from the pinned ^5.6 |
| 411 unit/integration tests on a `node:test` Vitest-API shim | 410 pass, 1 not run (`fake-indexeddb` missing) | **not real Vitest** |
| Contrast test negative-tested against the original CSS | 3 of 5 fail on the old CSS, 5/5 pass on the fix | real |
| Real controller + simulator scenarios (alerts, skip case, dataset variants) | behaved as the scheduler/presenter document | real code, manual scheduler |
| e2e specs typechecked against Playwright 1.56 types; clock mechanics on a throwaway page | exit 0; 191 of 191 expected interval firings | API usage and mechanics only |

## What is NOT RUN
Real `npm install`, `npm run typecheck`, `npm test`, `npm run build` since chunk 4; `npm run test:e2e` (never); `npm audit` (6 advisories untriaged); the whole phone checklist (41 rows, KOS 13): install, offline reload on a device, real GPS, notification delivery, update flow, file download and clipboard, rendering and low-light readability on a phone, iOS Safari; the `fake-indexeddb` test.

## Defects found in this chunk
- Secondary text colour measured 3.64:1 on panel surfaces (WCAG AA needs 4.5:1): fixed (ADR-045), guarded by `tests/unit/contrast.test.ts`.
- `@turf/turf` is an unused production dependency (≈130 packages): reported, not changed (R-043).
- A gap in the throwaway Vitest shim (not in the repo) was found and fixed.

## Known limits
Foreground-only: a web app cannot guarantee GPS or alerts once the phone suspends it. Map tiles are never cached. Dataset status is read from the file's own metadata. The replay clock is simulated. The log is device-local and typed by a person; it is not evidence. Replay runs at ~5.6× real time, so e2e needs a controlled clock. No vessel-profile screen was built. See KOS 08 for all 44 risks.

## Release gates
None is met. The list, with the evidence each one needs, is in KOS 11 ("Release gates — restated after chunk 6").
