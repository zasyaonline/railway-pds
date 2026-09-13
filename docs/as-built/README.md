# Railway PDS & Coach Position — As-Built Documentation Pack

| Field | Value |
|-------|-------|
| **Suite version** | 1.1.0 |
| **Generated** | 2026-08-21 |
| **Last refreshed** | 2026-08-25 |
| **Scope** | Monorepo `railway-pds` — Passenger Display System (PDS) + Coach Position |
| **Audience** | Customer stakeholders, ops, maintainers, future delivery teams |
| **Status** | See [PROJECT_DOCUMENTATION_STATUS.md](./PROJECT_DOCUMENTATION_STATUS.md) |

This pack describes the **as-built** system inferred from the running codebase and documented AWS resources. It is customer-shareable. Secrets and production passwords are never included.

---

## Portfolio

| Product | Public surface | Role |
|---------|----------------|------|
| **PDS** | https://platform.zasya.online | Live arrivals / departures board |
| **Coach Position** | https://coach-position.zasya.online | Coach rake + “You are here” (Current TV / Premium / Chart) |
| **Shared** | NTES + PDS Lambda poller | One NTES fetch per station; JSON to S3/CloudFront |

**Frozen architecture:** Chrome/Edge TVs only; **no station PC**; Coach URL = `?station=` + `?display=`; billing **per physical screen**.

**Coach display options (same data, different presentation):**

| Theme | URL path | Notes |
|-------|----------|-------|
| Current TV | `/` | Reference dark TV layout |
| Premium TV | `/premium.html` | Stronger hierarchy / wayfind panel |
| Chart | `/chart.html` | Light NTES-style coach icons |

All three share `js/app.js` and station layout JSON. Footer links switch themes while preserving `station` + `display` query params.

---

## Navigation

### Business & product

| # | Document |
|---|----------|
| 01 | [Executive Summary](./01-executive-summary.md) |
| 02 | [Business Overview](./02-business-overview.md) |
| 03 | [Problem Statement](./03-problem-statement.md) |
| 04 | [Solution Overview](./04-solution-overview.md) |
| 06 | [Business Logic](./06-business-logic.md) |
| 07 | [Process Flows](./07-process-flows.md) |
| 08 | [Module Breakdown](./08-module-breakdown.md) |

### Technical

| # | Document |
|---|----------|
| 05 | [System Architecture](./05-system-architecture.md) |
| 09 | [Database / Data Store Documentation](./09-database-documentation.md) |
| 10 | [API Documentation](./10-api-documentation.md) |
| 11 | [Authentication & Authorization](./11-authentication-authorization.md) |
| 12 | [Frontend Architecture](./12-frontend-architecture.md) |
| 13 | [Backend Architecture](./13-backend-architecture.md) |
| 18 | [Integrations](./18-integrations.md) |

### Security, DevOps & ops

| # | Document |
|---|----------|
| 14 | [DevOps & Deployment](./14-devops-deployment.md) |
| 15 | [Environment Configurations](./15-environment-configurations.md) |
| 16 | [Security Considerations](./16-security-considerations.md) |
| 17 | [Logging & Monitoring](./17-logging-monitoring.md) |
| 19 | [User Management](./19-user-management.md) |
| 20 | [Roles & Permissions](./20-roles-permissions.md) |
| 21 | [Setup & Installation Guide](./21-setup-installation-guide.md) |
| 22 | [GitHub Setup Guide](./22-github-setup-guide.md) |
| 23 | [Production Hosting Guide](./23-production-hosting-guide.md) |
| 24 | [Troubleshooting Guide](./24-troubleshooting-guide.md) |
| 25 | [Known Issues & Limitations](./25-known-issues-limitations.md) |
| 26 | [Future Enhancements](./26-future-enhancements.md) |

### Diagrams & assets

| Path | Contents |
|------|----------|
| [diagrams/](./diagrams/) | Architecture, deployment, request lifecycle, auth |
| [erd/](./erd/) | JSON data model (no SQL ERD) |
| [api/](./api/) | API quick-reference |
| [workflows/](./workflows/) | Focus selection + cross-platform wayfinding |
| [assets/](./assets/) | Reserved for exports |

### Meta

| Document | Purpose |
|----------|---------|
| [CHANGELOG.md](./CHANGELOG.md) | Suite version history |
| [PROJECT_DOCUMENTATION_STATUS.md](./PROJECT_DOCUMENTATION_STATUS.md) | Confidence, gaps, manual verification |

---

## Glossary

| Term | Meaning |
|------|---------|
| **PDS** | Passenger Display System — multi-row arrivals/departures board |
| **Coach Position** | Horizontal coach rake display with traveller pin |
| **NTES** | National Train Enquiry System (Indian Railways live enquiry) |
| **Display** | Configured TV profile (platform pin, facing, mode) |
| **FOB** | Foot over bridge — circulation amenity used for cross-platform guidance |
| **Session** | Browser tab heartbeat for remote stop |
| **Poller** | Scheduled Lambda that fetches NTES and writes S3 JSON |
| **Option B** | Host Coach Save/poller on existing PDS Lambdas (as-built choice) |
| **Publish UI** | `coach-position/scripts/publish-ui.sh` — sync static Coach UI to S3 + invalidate CloudFront (not done by git push alone) |

## Acronyms

ACM, API, CDN, CF (CloudFront), CHZ (Charlapalli), CORS, DNS, IAM, IR, JSON, NTES, OAC, PF (platform), RBAC, S3, SPA, TLS, UA (User-Agent).

## Assumptions

1. Documented public domains and AWS resource IDs in repo READMEs/`INFRA.md` reflect the intended production footprint.
2. Dedicated Coach CloudFormation stack may exist in templates but **live Coach admin/poller uses PDS Lambdas (option B)**.
3. Commercial bands in [RATE_CARD.md](../coach-position/RATE_CARD.md) are sales guidance, not contracts.
4. No relational database — persistence is **S3 JSON** (+ local files for Express).

## Checklists

- [Deployment checklist](./23-production-hosting-guide.md#deployment-checklist)
- [Production readiness checklist](./23-production-hosting-guide.md#production-readiness-checklist)

## Related product docs (pre-existing)

- [docs/coach-position/](../coach-position/) — MODEL, wireframes, schemas, RATE_CARD
- Root [README.md](../../README.md)
- [coach-position/README.md](../../coach-position/README.md)
- [coach-position/INFRA.md](../../coach-position/INFRA.md)
