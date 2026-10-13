# 06 — Regulatory Source Register

Rule: record publisher, URL, date accessed, effective date, scope, status, reviewer. Primary sources only for operational data.
**No source below has been reviewed.** The sandbox had no internet access on 2026-10-12, so "Date accessed" is NOT ACCESSED for all rows.

| ID | Source | URL | Publisher | Date accessed | Effective date | Scope to extract | Status | Reviewer |
|---|---|---|---|---|---|---|---|---|
| SRC-01 | IMO — SOx and PM, MARPOL Annex VI Reg. 14 | https://www.imo.org/en/ourwork/environment/pages/sulphur-oxides-%28sox%29-%E2%80%93-regulation-14.aspx | IMO | NOT ACCESSED | UNKNOWN | Sulphur limits; ECA applicability; changeover record-keeping provisions (exact clause to be confirmed) | PROPOSED (starting reference) | — |
| SRC-02 | IMO — NOx, MARPOL Annex VI Reg. 13 | https://www.imo.org/en/ourwork/environment/pages/nitrogen-oxides-%28nox%29-%E2%80%93-regulation-13.aspx | IMO | NOT ACCESSED | UNKNOWN | Tier applicability by engine/date; NECA designations | PROPOSED | — |
| SRC-03 | MDN — Geolocation API | https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API | MDN | NOT ACCESSED | n/a | Permission, secure context, error codes | PROPOSED | — |
| SRC-04 | MDN — `watchPosition()` | https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/watchPosition | MDN | NOT ACCESSED | n/a | Options, callbacks, lifecycle | PROPOSED | — |
| SRC-05 | Apple — Web Push in web apps and browsers | https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers | Apple | NOT ACCESSED | n/a | iOS notification prerequisites and limits | PROPOSED | — |
| SRC-06 | Leaflet reference | https://leafletjs.com/reference.html | Leaflet | NOT ACCESSED | n/a | API surface | PROPOSED | — |

## Sources still needed (UNKNOWN — not yet identified)
- Authoritative ECA designation text and boundary coordinates (IMO / MARPOL Annex VI appendices; national/flag-state sources).
- Licence/usage rights for any boundary geometry before bundling.
- Authorised FOBAS-compatible method, parameters and benchmark cases (owner to obtain).
- Nautical-mile / knot definition citation (to move §05 conventions toward VERIFIED).
- Browser support data for Notifications/Service Worker/`display: standalone` on target devices (real-device testing preferred).
