# 03 — Problem Statement

## Operational problem

Railway stations must present **current** train information to passengers: expected arrival/departure, platform, status, and—for coach displays—**where coaches stop relative to the passenger**. Manual boards and one-off PC-per-station setups do not scale cleanly across dozens of stations and screens.

## Industry pain points addressed

| Pain | Impact |
|------|--------|
| Stale or handwritten platform boards | Passenger confusion, crowd mismanagement |
| PC or mini-server per station | CapEx, theft/failure risk, remote support cost |
| Hitting NTES from every TV | Cost explosion, rate risk, CORS/browser limits |
| English-only boards | Accessibility gap for TE/HI speakers |
| No remote kill-switch for stuck screens | Ops must physically reboot TVs |

## Manual process limitations

Without automation, staff re-enter platforms and times, cannot consistently show coach composition or Divyangjan (PWD) coach indices from NTES, and cannot rotate languages or page large boards reliably.

## Efficiency & automation gains

| Area | Gain |
|------|------|
| Data | NTES Live Station polled in the cloud on a schedule |
| Delivery | CloudFront serves HTML/JS/JSON over HTTPS |
| Ops | Admin can switch station, override PF (PDS), stop sessions |
| Cost | One poller per station; TVs read cached JSON |
| UX | Language rotation and paging without operator action |

## Scalability improvements

- Station roster for Coach is a JSON index (`station_index.json`); poller can shard large fleets.
- Display count scales by opening more browser URLs — not by installing more servers.
- Shared PDS Lambda hosts Coach Save/board APIs (option B), avoiding a second IAM-heavy stack when PassRole is constrained.

## What this does not solve

- Guaranteeing NTES availability or composition completeness for every MEMU/EMU.
- Replacing CCTV, PA, or reservation systems.
- Multi-tenant SaaS billing automation (rate card is commercial guidance only).
