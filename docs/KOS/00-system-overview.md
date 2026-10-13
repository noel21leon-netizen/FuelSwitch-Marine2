# 00 — System Overview

**Product:** FuelSwitch Marine · **Feature:** ECA Changeover Assistant
**Form:** Installable, phone-first Progressive Web App (PWA), local-first, no backend.
**Last updated:** 2026-10-12 · **Delivery:** chunked (see CHANGELOG and NEXT_STEPS.md)

> **Operating boundary.** Advisory planning / decision-support prototype. Not an approved
> navigation system. Never operates fuel equipment. Makes no compliance or certification
> claim and shows no validated FOBAS output until a verified method and benchmark cases exist.

## Purpose
Help shipboard engineers anticipate an applicable SOx ECA boundary crossing, plan fuel
changeover start from a **manually verified** duration plus margin, see vessel / boundary /
crossing / planned-start on a map, receive supported alerts, and keep a traceable,
human-confirmed log.

## Status labels (used everywhere in the KOS)
`VERIFIED` authoritative source or reproducible test · `PROPOSED` recommendation, not accepted/validated ·
`UNKNOWN` evidence or decision missing · `SIMULATED` prototype/test data only · `EXPIRED` needs re-review.
Never promote PROPOSED/SIMULATED to VERIFIED silently.

## Delivery plan (6 chunks, cumulative zips)
| Chunk | Content | State |
|---|---|---|
| 1 | KOS, CLAUDE.md, scaffold, PWA static assets, synthetic data, phone-first shell, SW source | DELIVERED (not built — see below) |
| 2 | Domain layer: position validation, units, geospatial route/crossing, ETA, planner + unit tests | DELIVERED (sandbox-tested only) |
| 3 | Adapters + monitoring: browser GPS, simulator, notifications, alert scheduler, progress-continuity, monitoring use-case, local dataset loader | DELIVERED (sandbox-tested only; IndexedDB moved to chunk 4/5, ADR-027) |
| 4 | Application use-cases + UI: dashboard, Leaflet map, planner, regulatory status (vessel profile not built) | DELIVERED (real typecheck/test/build ran once, KOS 11; browser NOT RUN) |
| 5 | Changeover log + CSV export (5A/5B), SW registration/update UX, dataset status, install help, fix age + skipped alerts (5C-1…5C-3), manual phone checklist + 0.5.0 label (5C-4, KOS 13) | DELIVERED (sandbox-tested only; phone checklist NOT RUN) |
| 6 | Integration/e2e tests, hardening, release-readiness review, final report | WRITTEN — e2e specs never run; `npm audit`, real install/typecheck/test/build and the phone checklist NOT RUN; no release gate met (KOS 11, 14) |

## Current implementation status (evidence-based)
- Source files (chunks 1–5), KOS and static PWA assets are written. Version label 0.5.0 marks the end of chunk 5; it is not a release.
- **`npm install`, `npm run build`, `npm test`: NOT RUN** — the authoring sandbox had no network access
  (install timed out). TypeScript/Vite/Vitest behaviour is therefore **UNKNOWN** until you run them.
- Only `node scripts/verify-scaffold.mjs` (no dependencies) has been run; results are in `11-release-readiness.md`.
- No real-device PWA, GPS or notification test has been run: **NOT RUN**.

## Data status
All geography is `synthetic` (fictional polygon in open ocean). No real ECA geometry exists in the repo.
