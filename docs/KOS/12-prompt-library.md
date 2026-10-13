# 12 — Prompt Library

## P-CONT — continue to next chunk (paste into a new or existing Claude session)
> Read `CLAUDE.md`, `NEXT_STEPS.md` and all files in `docs/KOS/` first. Summarise repository status from the files themselves.
> Then implement **chunk N** exactly as listed in `docs/KOS/00-system-overview.md`. Preserve existing work, update the KOS and
> CHANGELOG, run every command that can run, report exact results, and produce a cumulative zip with instructions for chunk N+1.

## P-REVIEW — code review
> Review the diff against `docs/KOS/02-requirements.md` and `05-calculation-spec.md`. Flag any unverified claim, domain logic in UI,
> hidden warning, false precision or synthetic data presented as real.

## P-TEST — test authoring
> For the listed requirement IDs, write deterministic Vitest tests using the synthetic fixtures. Do not use GPS, network or the clock
> without injection. Run them and record results in `11-release-readiness.md`.

## P-REG — regulatory research (needs internet)
> Open the primary sources in `06-regulatory-source-register.md`, record date accessed, effective date, scope and exact clause
> references. Do not copy boundary coordinates until licence and provenance are recorded. Mark results PROPOSED until a human reviews.

## P-REL — release review
> Walk every gate in `11-release-readiness.md`, cite evidence for each, and list what is NOT RUN or NOT MET. No optimistic wording.
