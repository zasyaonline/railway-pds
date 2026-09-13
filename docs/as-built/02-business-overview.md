# 02 — Business Overview

## Products

| Product | Host | Primary job |
|---------|------|-------------|
| Railway PDS | `platform.zasya.online` | Show upcoming trains at a station with PF, times, status |
| Coach Position | `coach-position.zasya.online` | Show coach order for the featured halt with you-are-here pin |

Both are **display applications**, not booking, ticketing, or ERP systems.

## Stakeholders

| Stakeholder | Interest |
|-------------|---------|
| Railway / station authority | Accurate passenger information, branding |
| System integrator (Zasya) | Deploy once, scale stations, contain AWS cost |
| On-site ops | Change station/display, stop bad screens |
| Passengers | Clear EN/TE/HI information |

## Commercial model (as documented)

From [docs/coach-position/RATE_CARD.md](../coach-position/RATE_CARD.md):

| Line | Guidance |
|------|----------|
| Device licence | ₹200–400 / physical screen / month |
| AWS COGS | ~₹25–50 / screen / month at ~30 screens |
| 24×7 ops | Optional ₹25,000–50,000 / month retainer |

**Rule:** one physical TV running PDS and/or Coach = **one** device fee.

## Scale intent (from product decisions in repo)

- Pilot: 1 station → bulk ~30+ stations.
- Both PDS and Coach available per station; display count varies by station size.
- Coach TVs: Chrome/Edge only; no Android WebView / kiosk OS work in scope of current as-built.

## System boundaries

**In scope**

- Live NTES station board ingestion
- Static display UIs + admin UIs
- Cloud poller, S3 caches, CloudFront delivery
- Session stop (PDS production; Coach local / evolving)
- Per-station Coach display profiles

**Out of scope (not implemented)**

- User accounts, SSO, RBAC
- Relational databases
- Payments / billing engines
- Queues / WebSockets
- On-premise station servers
- Mobile native apps

## Related business docs

- [03 — Problem Statement](./03-problem-statement.md)
- [04 — Solution Overview](./04-solution-overview.md)
- [RATE_CARD](../coach-position/RATE_CARD.md)
