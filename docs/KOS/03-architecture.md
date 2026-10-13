# 03 — Architecture

Status: PROPOSED (owner baseline ADR-001…007 adopted; see 09).

## Layers and dependency rule
```
Presentation  src/app, src/features      → may import Application, Domain types, shared
Application   src/application/use-cases  → may import Domain + Port interfaces
Domain        src/domain                 → imports NOTHING from other layers, no DOM/React/Leaflet/IndexedDB
Infrastructure src/infrastructure        → implements Ports; may import Domain types
Shared        src/shared                 → constants, tiny utilities (no logic of record)
```
Rule: arrows only point inward toward Domain. Domain never imports browser APIs (NFR-004).

## Ports (interfaces; browser adapters now, native adapters possible later)
`PositionProvider` (the NEXT_STEPS "GeolocationPort") · `NotificationProvider` · `BoundaryRepository` · `LocalStore` · `MapViewAdapter` · `ChangeoverCalculator`
Ports live beside the domain/application code that needs them; adapters live in `src/infrastructure`.

## Modules
| Folder | Responsibility | Chunk |
|---|---|---|
| domain/position | Position validation, freshness, quality | 2 |
| domain/geospatial | Route distance, nearest-point, boundary intersection, direction, inside test | 2 |
| domain/eta | Units, time-to-crossing, ETA result union with unavailable reasons | 2 |
| domain/changeover | Planner, `ChangeoverCalculator` interface, manual-verified implementation | 2 |
| domain/regulations | Dataset status rules (synthetic/unverified/verified/expired), SOx vs NOx records | 2 |
| domain/alerts | Alert scheduler: thresholds, duplicate suppression, re-arm, overdue (pure) | 3 |
| domain/logging | Log entry types, CSV export formatting (pure) | 2/5 |
| application/use-cases | StartMonitoring, UpdatePosition, RecalculateCrossing, RecalculateChangeoverPlan, ScheduleAlerts, ConfirmChangeoverStart/Completion, ExportChangeoverLog | 4/5 |
| infrastructure/geolocation/browser | `watchPosition` adapter | 3 |
| infrastructure/geolocation/simulator | Deterministic route replay | 3 |
| infrastructure/notifications/browser | Permission, thresholds, de-duplication | 3 |
| infrastructure/map/leaflet | Leaflet `MapViewAdapter` | 4 |
| infrastructure/persistence/indexeddb | Settings, vessel profile, logs via `idb` | 4/5 (moved from 3, ADR-027) |
| infrastructure/regulatory-data/local | Loads bundled synthetic GeoJSON + metadata | 3 (done) |
| infrastructure/pwa | Service-worker registration adapter (`workbox-window` wrapper + browser-free core) | 5C-1 |
| application/use-cases/pwaStatus | PWA lifecycle reducer + `applyPwaUpdate` (injected registrar and reload) | 5C-1 |
| features/pwa | Update/offline banner, More-tab status panel, `usePwaStatus`, wording | 5C-1 |
| domain/regulations/datasetStatus | Pure presenter: dataset + injected `nowUtc` → status label, source/version, notices (reuses `evaluateDatasetUsability`) | 5C-2 |
| application/use-cases/installAdvice | Pure install guidance + install-outcome text over `InstallEnvironment` | 5C-2 |
| infrastructure/pwa/installPrompt, browserInstallPrompt | Install-prompt adapter core (event target injected) + browser wiring (`beforeinstallprompt`, `appinstalled`, standalone/iOS/secure-context probes) | 5C-2 |
| features/regulatory-status, features/pwa | `DatasetStatusPanel` (More tab); `useInstallAdvice` + `InstallHelpPanel` | 5C-2 |

## Data flow (target)
Position source (browser GPS | simulator) → `UpdatePosition` → validate/freshness (domain) →
`RecalculateCrossing` (route + boundary) → ETA result → `RecalculateChangeoverPlan`
(crossing − duration − margin, planned start point) → state → UI + `ScheduleAlerts`.
Any invalid link yields an *unavailable-with-reason* result, never a default number.

## PWA architecture
- `public/manifest.webmanifest` (hand-written, single source) + real icons under `public/icons/`.
- `src/sw.ts` built with `vite-plugin-pwa` **injectManifest** (ADR-009): precaches app shell + bundled synthetic data only.
- Registration (5C-1): `src/infrastructure/pwa/` — `serviceWorkerRegistrar.ts` (browser-free core: environment check, event mapping, idempotent `start()`, event replay, `applyUpdate()` with timeout) and `browserServiceWorker.ts` (the only file importing `workbox-window`). Not registered in dev builds (ADR-034).
| domain/position/fixAge | Pure presenter: position assessment + stale limit → fresh / stale / unavailable text, no number without a valid fix | 5C-3 |
| domain/alerts/skipped, domain/alerts/scheduler | `SkippedThreshold` reasons decided by the scheduler (`skippedDetail`, `AlertState.planSeen`); wording `describeSkippedThreshold` | 5C-3 |
| application/use-cases/monitoring | `MonitoringSnapshot.skippedThresholds`: session-only cumulative list of scheduler skips with `recordedAtUtc` | 5C-3 |
- Update flow (5C-1): new worker waits; the UI shows "Update available" and posts `SKIP_WAITING` **only when the user taps**; the page reloads only after the new worker controls it. `sw.ts` never calls `clientsClaim()` (ADR-035). State lives in the pure `reducePwaState` (`application/use-cases/pwaStatus.ts`); wording in `features/pwa/describePwaState.ts`.
- Relative `base: './'` (ADR-008) so hosting under a sub-path works.
- No runtime caching of any production regulatory dataset (chunk 5 enforces + tests).
- Map tiles need network; offline, overlays (boundary/route/vessel) must still draw on a plain background (R-013).

- Precache scope (5C-2, ADR-039): `src/sw.ts` registers only the navigation route; there is no runtime caching, so a regulatory dataset can never be served from a runtime cache. `tests/integration/precache-scope.test.ts` pins this (static source check, not a browser check).

## Planned dependencies (versions PROPOSED — could not be installed or checked offline)
react/react-dom 18, vite 5, vite-plugin-pwa 0.21, typescript 5.6, vitest 2, leaflet 1.9, @turf/turf 7,
idb 8, workbox-* 7, fake-indexeddb 6, @vitejs/plugin-basic-ssl. Re-verify versions on first `npm install`.

## Not configured (by decision)
ESLint is not set up in chunk 1 (ADR-011); `lint` does not exist and must not be reported as passing.

## Chunk 4 update
src/app/App.tsx composes the monitoring controller, local synthetic dataset loader, browser GPS/simulator providers, notification adapter and Leaflet map. Settings live in IndexedDB through src/infrastructure/persistence/indexeddb/localStore.ts. Map tiles are optional network content; locally bundled synthetic overlays do not require tiles. Browser/device behavior remains unverified until build and manual checks.

