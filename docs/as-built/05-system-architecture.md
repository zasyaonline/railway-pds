# 05 — System Architecture

## Overview

The system is a **serverless dual-product** architecture: two static frontends, one shared NTES integration, S3 JSON as the system of record for display state, and Lambda functions for API and scheduled refresh.

There is **no** relational database, Redis cache, message queue, WebSocket tier, or multi-tenant SaaS control plane in the as-built codebase.

## High-level architecture

See also: [diagrams/01-high-level-architecture.md](./diagrams/01-high-level-architecture.md)

```mermaid
flowchart LR
  subgraph clients [Clients]
    Pdstv[PDS TV]
    CoachTv[Coach Current / Premium / Chart]
    Admin[Admin]
  end

  subgraph edge [Edge]
    CfPds[CloudFront platform]
    CfCoach[CloudFront coach-position]
  end

  subgraph compute [Compute]
    Api[railway-pds-CHZ-api]
    Refresh[railway-pds-CHZ-refresh]
  end

  subgraph data [Data]
    S3pds[PDS S3 bucket]
    S3coach[Coach S3 bucket]
  end

  NTES[NTES]

  Pdstv --> CfPds
  CoachTv --> CfCoach
  Admin --> CfPds
  Admin --> CfCoach
  CfPds -->|/api| Api
  CfPds --> S3pds
  CfCoach --> S3coach
  Api --> S3pds
  Api --> S3coach
  Refresh --> NTES
  Refresh --> S3pds
  Refresh --> S3coach
```

## Frontend architecture

| App | Stack | Delivery |
|-----|-------|----------|
| PDS | Vanilla JS, CSS, HTML | S3 → CloudFront |
| Coach | Vanilla JS, CSS, HTML (Current TV + Premium + Chart themes) | S3 → CloudFront |

No React/Vue/Angular. Config via `public/config.js` / `coach-position/public/config.js`.

Details: [12 — Frontend Architecture](./12-frontend-architecture.md).

## Backend architecture

| Mode | Entrypoint | Role |
|------|------------|------|
| Production API | `lambda/api.js` | HTTP API (API Gateway) |
| Production poller | `lambda/refresh.js` + `lambda/coachRefresh.js` | EventBridge schedule |
| Local PDS | `server.js` + `routes/api.js` | Express `:3000` |
| Local Coach | `coach-position/server.js` + `routes/api.js` | Express `:3001` |

Dedicated Coach Lambda template exists under `coach-position/infra/` but **production Coach Save/poller is option B** (PDS Lambdas). See [13 — Backend Architecture](./13-backend-architecture.md).

## API layer

- **PDS:** CloudFront path `/api/*` → HTTP API → `railway-pds-CHZ-api`.
- **Coach TVs:** no `/api` on CloudFront; static JSON only.
- **Coach Admin Save:** direct HTTP API host (`LOOKUP_BASE` / execute-api URL) for `/api/coach/*` and `/api/station-lookup`.

## Data layer (not SQL)

JSON documents in S3 / local `data/`. See [09 — Database Documentation](./09-database-documentation.md).

## Authentication layer

Shared string admin keys (`ADMIN_KEY`, `COACH_ADMIN_KEY`). Viewer sessions via `X-Session-Id`. No JWT/OAuth/MFA. See [11 — Authentication](./11-authentication-authorization.md).

## Cache layer

| Cache | Mechanism |
|-------|-----------|
| CloudFront static assets | Long-cache images; UI cache-bust query `?v=` |
| Coach board JSON | Recommended short TTL (~30–60s) on put |
| Browser | `cache: 'no-store'` on live fetches |
| Lambda in-memory | None significant |

## Queue / background jobs

| Job | Trigger | Handler |
|-----|---------|---------|
| NTES refresh | EventBridge `rate(1 minute)` | `railway-pds-CHZ-refresh` |
| Coach cache backup | GitHub Actions cron `*/5` | `publish-live-cache.sh` |

No SQS/Bull/Redis workers.

## WebSockets / events

**Not implemented.** Polling only.

## File storage & CDN

| Store | Content |
|-------|---------|
| PDS S3 | `public/` site + `data/*.json` |
| Coach S3 `railway-coach-position-site-884000107109` | Site + per-station JSON |
| CloudFront | OAC to private S3; HTTPS custom domains |

## Offline sync

**Not implemented.** Displays require network to CloudFront/API. Client re-picks Coach focus from wall clock vs cached `stationBoard` so a slightly stale cache still drops departed trains.

## Multi-tenant / mobile

| Concern | Status |
|---------|--------|
| Multi-tenant SaaS | N/A — station codes / display IDs only |
| Mobile apps | N/A — browser TVs only |

## Request lifecycles

### PDS TV poll

```mermaid
sequenceDiagram
  participant TV as PDS TV
  participant CF as CloudFront
  participant API as API Lambda
  participant S3 as PDS S3

  TV->>CF: GET /api/trains?sessionId=
  CF->>API: proxy /api/trains
  API->>S3: get config + live_status + overrides + sessions
  API->>S3: put sessions touch
  API-->>TV: JSON trains board
```

### Coach TV poll

```mermaid
sequenceDiagram
  participant TV as Coach TV
  participant CF as CloudFront
  participant S3 as Coach S3

  TV->>CF: GET /data/stations/BG/board.json
  CF->>S3: GetObject
  S3-->>TV: board JSON
  Note over TV: Client picks focus + applies ?display=
```

### Refresh poller

```mermaid
sequenceDiagram
  participant EB as EventBridge
  participant R as Refresh Lambda
  participant NTES as NTES
  participant S3p as PDS S3
  participant S3c as Coach S3

  EB->>R: schedule tick
  R->>S3p: read config
  R->>NTES: TrainsAtStationJson
  R->>S3p: put live_status.json
  R->>S3c: read station_index
  loop each station shard
    R->>NTES: live board + composition
    R->>S3c: put stations/CODE/board.json
  end
```

## Deployment topology

Documented resources (from repo READMEs / INFRA):

| Resource | ID / name |
|----------|-----------|
| Region | `ap-south-1` |
| Stack | `railway-pds-chz` |
| PDS CF | `EVTX6GW0ROE2O` |
| Coach CF | `E12U4PGOD25ISI` |
| HTTP API | `2j7ifmjjyb` |
| API Lambda | `railway-pds-CHZ-api` |
| Refresh Lambda | `railway-pds-CHZ-refresh` |
| EventBridge | `railway-pds-CHZ-refresh-schedule` |

Full diagram: [diagrams/02-deployment-topology.md](./diagrams/02-deployment-topology.md).
