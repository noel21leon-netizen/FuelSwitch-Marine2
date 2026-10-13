# 01 — Product Brief

## Users (PROPOSED)
Chief/second engineers and ETOs who must start a fuel changeover early enough before entering
an ECA, and who need a phone-sized tool usable in a wheelhouse or engine control room.

## Problem
Changeover timing is done by manual estimation against moving position and speed. Misjudging it
risks late changeover or avoidable operational stress. Evidence of the actual changeover must be recorded by a human.

## Goal
Show the predicted boundary crossing and the latest safe changeover start (crossing − verified
duration − margin) from live or simulated position, recalculating as inputs change, with honest
status when data is stale, missing or non-authoritative.

## Non-goals
- Not a navigation or chart system; not an approved ECDIS/INS function.
- Does not control, switch or monitor fuel equipment.
- Does not infer changeover completion from GPS; no compliance determination.
- No cloud accounts, backend, paid map APIs or secrets in milestone 1.
- No native app in milestone 1 (only evaluated if real-device tests prove the PWA insufficient).

## Success metrics (PROPOSED — not validated)
- Installs and launches standalone on target Android Chrome and iOS Safari (real device).
- Deterministic simulator reproduces expected ETA/planned-start values in unit tests.
- Every unavailable/stale/synthetic state is visibly labelled; no false precision.

## Open questions (UNKNOWN)
- Target phone models/OS versions and browsers.
- Authorised FOBAS-compatible method, parameters and benchmark cases.
- Which authoritative ECA geometry source and licence will be used.
- Company policy for default safety margin and alert thresholds.
- Whether an onboard position feed (NMEA over network) is wanted later.
