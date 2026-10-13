# 13 — Manual phone test checklist

Status: **every row is NOT RUN.** This file is a procedure for a person holding a real phone, not evidence. Do not change a result unless you did the step on a real device, and fill in the date and device. A row you could not do stays NOT RUN; a row that behaved differently from *Expect* is FAIL with notes (and goes into `11-release-readiness.md` and, if it is a defect, the risk register).

Result values: `NOT RUN` · `PASS` · `FAIL` · `BLOCKED` (could not be attempted, say why). Nothing here proves compliance, certification or a validated FOBAS output; all geography is synthetic (DEMO DATA).

## 0. Setup
- Build: `npm install && npm run typecheck && npm test && npm run build`. Record the real output in KOS 11 first; if typecheck fails, fix it before phone testing.
- Serve `dist/` over **real HTTPS** (static host or HTTPS tunnel). `npm run dev:https` uses a self-signed certificate that phones usually will not install or register a service worker against (ADR-015).
- Test at least: one Android phone with Chrome, one iPhone with Safari (iOS version noted). Note the OS version and browser version in each row.
- Start each section from a clean state when it says so (Chrome: Site settings → Clear & reset; Safari: Settings → Safari → Advanced → Website Data → remove the site).

## 1. Install and launch (NFR-001, FR-010)
| ID | Do | Expect | Result | Date | Device / OS / browser | Notes |
|---|---|---|---|---|---|---|
| P-01 | Open the HTTPS URL in Android Chrome, More tab → *Install this app* | Reads *Install prompt available* (may need a reload once the service worker is active) with an **Install app** button | NOT RUN | | | |
| P-02 | Tap **Install app**, accept | Outcome text appears; app appears on the home screen with the FuelSwitch icon (maskable icon not cropped badly) | NOT RUN | | | |
| P-03 | Launch from the home screen | Opens standalone (no browser bar); More tab says *Installed* | NOT RUN | | | |
| P-04 | iPhone Safari, same URL, More tab | iOS text mentions Share → Add to Home Screen; the steps match what Safari actually shows (record any difference) | NOT RUN | | | |
| P-05 | iPhone: Add to Home Screen, launch it | Opens standalone; icon and title *FuelSwitch* correct; safe areas not covered by the notch or home bar | NOT RUN | | | |
| P-06 | Open the app over plain `http://` on the LAN (not localhost) | More tab says install is not available because the page is not secure | NOT RUN | | | |

## 2. Offline and service worker (FR-010, NFR-003)
| ID | Do | Expect | Result | Date | Device / OS / browser | Notes |
|---|---|---|---|---|---|---|
| P-10 | Fresh profile, first load online, wait | *OFFLINE READY* chip and *App and offline status* panel appear. This means the worker finished installing, not that offline works | NOT RUN | | | |
| P-11 | Airplane mode, reload the app | Shell loads; Dashboard, Plan, Log, More work; map tiles absent; route and boundary overlays still drawn | NOT RUN | | | |
| P-12 | Still offline: Plan → enter duration and margin | Planned start updates; settings kept after reload | NOT RUN | | | |
| P-13 | DevTools (desktop or remote-debug) → Application → Cache Storage | Only the Workbox precache; both `.geojson` files present; no other caches (R-035) | NOT RUN | | | |
| P-14 | Deploy a new build, reopen the app online | *Update available* banner; nothing reloads by itself; the warning says live monitoring restarts | NOT RUN | | | |
| P-15 | Tap **Update and reload** | One reload only (no double reload); new version runs; replay restarts; saved settings and log entries still there; session alert and skipped lists are empty (R-030, R-038) | NOT RUN | | | |
| P-16 | Block `sw.js` (or serve a build where it 404s), load online | *Registration failed* state with the reason; app still usable online | NOT RUN | | | |
| P-17 | Android Chrome in a normal tab, then installed | Both register the worker; installed app also works offline | NOT RUN | | | |

## 3. Position, GPS and background limits (FR-001..FR-005, R-003)
| ID | Do | Expect | Result | Date | Device / OS / browser | Notes |
|---|---|---|---|---|---|---|
| P-20 | Plan → Position source *Browser live GPS*, deny location | Dashboard shows UNAVAILABLE with the permission reason; Fix age reads `Unavailable — …` with **no number**; ETA unavailable | NOT RUN | | | |
| P-21 | Allow location, outdoors | Badge LIVE; position, accuracy and SOG/COG shown or marked unavailable with a reason; Fix age `N s — fresh (stale after 30 s)` | NOT RUN | | | |
| P-22 | Stop fixes (airplane mode or GPS off) for > 30 s | Badge STALE; Fix age `NN s — STALE (limit 30 s)`; ETA unavailable with the stale reason; no invented numbers | NOT RUN | | | |
| P-23 | Lock the screen / switch apps for a few minutes, return | App shows the background limit text on More; position may be stale until fixes resume; nothing claims continuous tracking | NOT RUN | | | |
| P-24 | Route replay mode | SIMULATED badge everywhere; DEMO banner always visible | NOT RUN | | | |
| P-25 | Slow stationary SOG (below 0.5 kn) | ETA unavailable with an SOG reason, not a made-up speed | NOT RUN | | | |
| P-26 | Live GPS running outdoors, then airplane mode (or GPS off) for about 20 s, then back on | Within ~30 s: *GPS signal lost* with the real age of the last position and a *Trying again in N s* countdown; ETA and alerts paused. After signal returns it recovers to *GPS signal OK* **without tapping anything** (ADR-048). Record how long recovery took | NOT RUN | | | |
| P-27 | iPhone: turn Location off for Safari / the installed app, start live GPS | *Location is turned off for this app* with the Settings steps. Check the wording against what iOS really shows (record the iOS version and any difference). Allow location, return, tap **Try GPS again** | NOT RUN | | | |
| P-28 | Live GPS indoors or inside a building | *Searching for GPS signal…* or *Weak GPS signal* with the measured accuracy; ETA unavailable; no invented numbers | NOT RUN | | | |
| P-29 | Live GPS, phone stationary, screen kept on for 10 minutes | Position stays fresh or recovers on its own; record any repeated permission prompt, flicker between states, or unusual battery drain (R-045) | NOT RUN | | | |
| P-64 | iPhone only: install the app to the Home Screen, open it from the icon, choose Browser live GPS and refuse (or have blocked) location | Plain message "Home Screen apps on iPhone may not allow GPS. Open the link in your browser instead." with no Settings steps and no Try GPS again button; then open the link in Safari and check whether GPS works there (R-046). Record iOS version and what you actually saw | NOT RUN | | | |

## 4. Alerts and notifications (FR-008)
| ID | Do | Expect | Result | Date | Device / OS / browser | Notes |
|---|---|---|---|---|---|---|
| P-30 | Plan → Enable notification permission → Show test alert | Browser asks; test alert shown as a notification or, if refused, *shown in app only* with the reason | NOT RUN | | | |
| P-31 | Replay with a plan that gives about 26 min to planned start (duration ≈ 1240, margin 10 on the demo route; adjust until the Dashboard shows < 30 min) | A 30-min alert; *Skipped alerts* shows `60-min alert skipped: already passed when the first usable plan was calculated (the 30-min alert was raised instead).` and keeps showing it, once | NOT RUN | | | |
| P-32 | During a > 60 min plan, raise the duration so 60 and 30 pass at once | `60-min alert skipped: passed together with the closer 30-min threshold, so only that alert was raised.` | NOT RUN | | | |
| P-33 | Reload | Skipped list empty (*None this session*), rebuilt from the new session | NOT RUN | | | |
| P-34 | App in the background or phone locked while an alert is due | Record exactly what happens (notification, none, delayed). A notification must never be treated as guaranteed (R-004, R-003) | NOT RUN | | | |
| P-35 | iPhone: notification support | Record whether notifications work from Safari tab vs installed app (iOS prerequisites UNKNOWN until sourced) | NOT RUN | | | |

## 5. Dataset status (FR-010, 5C-2)
Use a temporary edit of `public/demo-data/synthetic-eca.geojson`, rebuild, and **revert afterwards**.
| ID | Do | Expect | Result | Date | Device / OS / browser | Notes |
|---|---|---|---|---|---|---|
| P-40 | Unmodified build, More tab | `SYNTHETIC`, DEMO warning, source *Hand-made fictional polygon…*, version `0.1.0-synthetic`, dates *not recorded*, assessed-at with *simulated clock* (replay) or *device clock* (live) | NOT RUN | | | |
| P-41 | `verificationStatus` = `expired` (+ `sourceName` `test`, `sourceUrl` `https://example.invalid`) | EXPIRED, *not used* notice; Dashboard row `EXPIRED — … (not used)`; boundary distance and ETA unavailable with the reason | NOT RUN | | | |
| P-42 | `unverified` | UNVERIFIED + WARNING; ETA still computed | NOT RUN | | | |
| P-43 | `verified`, `effectiveFrom` 2025-01-01, `effectiveTo` 2026-01-01, `lastReviewedAtUtc` 2026-01-01 | **EXPIRED**, never VERIFIED | NOT RUN | | | |
| P-44 | Installed app after a rebuild with a changed dataset, before tapping Update | Old bundled dataset still shown until the update is applied (R-036); note it | NOT RUN | | | |

## 6. Changeover log and export (FR-009, FR-012)
| ID | Do | Expect | Result | Date | Device / OS / browser | Notes |
|---|---|---|---|---|---|---|
| P-50 | Log tab → create an entry from the current plan | Entry shows plan snapshot, SIMULATED or live label, DEMO banner; no actual start/completion filled in automatically | NOT RUN | | | |
| P-51 | Confirm start, then completion, with the time input | Times stored as ISO UTC from what you typed; impossible dates rejected | NOT RUN | | | |
| P-52 | Reload the app, return to Log | Entries still there (IndexedDB) | NOT RUN | | | |
| P-53 | **Download CSV** | A file is saved on the phone; open it: `provenance` and `data_notice` columns present; timestamps UTC | NOT RUN | | | |
| P-54 | **Copy CSV**, paste into a notes app | Pasted text matches the file | NOT RUN | | | |
| P-55 | Clear site data, reopen | Log is gone (R-029) — confirm this is clearly warned in the Log tab | NOT RUN | | | |

## 7. Readability and layout (NFR-008)
| ID | Do | Expect | Result | Date | Device / OS / browser | Notes |
|---|---|---|---|---|---|---|
| P-60 | Dim room / night brightness, Dashboard | Every row readable, including the dim *Skipped alerts* text (it uses the muted style — record if too faint) | NOT RUN | | | |
| P-61 | Small phone width (about 360 px) and large text setting | No sideways scrolling; Fix age and Skipped alerts rows wrap cleanly | NOT RUN | | | |
| P-62 | Landscape and notch devices | Navigation bar not hidden by home indicator or notch | NOT RUN | | | |
| P-63 | Status read without colour | Badges and statuses are understandable from the text alone | NOT RUN | | | |

## Sign-off
No row above has been run. A person who completes this list has produced *test evidence for a prototype*; it does not meet the release gates in KOS 11 (authorised FOBAS method or explicit manual-only policy, verified geometry with licence, qualified marine engineer review, risk triage).

> Note added in chunk 6: secondary/muted text now uses the new `--ink-300` colour (ADR-045; the old colour measured 3.64:1 on panels). When you do the readability rows (P-60 and neighbours), judge the NEW colour. Contrast was only calculated from the CSS; how it looks on a phone in low light is still NOT RUN. All rows remain NOT RUN until a person does them.

> Owner report, 2026-10-13: after the GitHub Pages deployment (HTTPS), the owner ran the quick pass (install, offline reload, changeover log/CSV, alerts, readability, update) on a real phone and reported verbally that "all are working". **The owner later said the device was an iPhone 12 Pro (iOS and Safari versions not given). No per-row detail was given, and no row's Result has been changed.** The Android rows (P-01 to P-03, P-17) were not covered by this device. Rows stay NOT RUN until the device and what was seen are recorded; this note is an owner statement, not test evidence from the assistant.
