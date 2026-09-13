# 07 — Process Flows

## Coach TV load

```mermaid
flowchart TD
  A[Open Current Premium or Chart URL] --> B[Load types layout stations displays]
  B --> C{Localhost or API_BASE set?}
  C -->|Yes| D[GET /api/coach-board]
  C -->|No CloudFront| E[GET /data/stations/CODE/board.json]
  D -->|ok| F[Apply display overlay]
  D -->|fail| E
  E --> F
  F --> G[pickLiveFocus + render]
  G --> H{Cross_platform_FOB?}
  H -->|Yes| I[PF1 deck amenities survey FOB walk from pin]
  H -->|No| J[Same_platform_deck]
  I --> K[Interval refresh 15s]
  J --> K
  K --> C
```

Related: [workflows/coach-cross-platform-wayfinding.md](./workflows/coach-cross-platform-wayfinding.md)

## PDS TV load

```mermaid
sequenceDiagram
  participant U as Viewer
  participant TV as app.js
  participant API as /api/trains

  U->>TV: Open platform URL
  TV->>TV: Ensure sessionId in localStorage
  loop every ~30s
    TV->>API: GET trains + X-Session-Id
    alt 409 session_stopped
      API-->>TV: stopped payload
      TV->>U: Show reconnect UI
    else 200
      API-->>TV: trains + meta
      TV->>U: Render page / language
    end
  end
```

## Admin unlock (shared pattern)

```mermaid
flowchart TD
  A[Open admin.html] --> B[Enter admin key]
  B --> C[Call protected API with X-Admin-Key]
  C -->|401| D[Show invalid key]
  C -->|200| E[Show panel]
  C -->|HTML not JSON| F[Fall back static or hint local API]
```

## PDS apply station

```mermaid
sequenceDiagram
  participant Ops as Admin UI
  participant API as POST /api/admin/station
  participant NTES as NTES
  participant S3 as S3 config

  Ops->>API: stationCode + admin key
  API->>NTES: resolveStationFromNtes
  alt invalid
    API-->>Ops: 400
  else ok
    API->>S3: update config.json
    API-->>Ops: new stationName
    Note over API: Immediate refresh may be triggered
  end
```

## Coach save station / display

```mermaid
sequenceDiagram
  participant Ops as Coach Admin
  participant Lookup as GET /api/station-lookup
  participant Save as POST /api/coach/displays
  participant S3 as Coach S3

  Ops->>Lookup: code=
  Lookup-->>Ops: stationName
  Ops->>Save: stationCode + optional display
  Save->>S3: stations/CODE/displays.json
  Save->>S3: upsert station_index.json
  Save-->>Ops: ok
```

## Platform override (PDS)

```mermaid
flowchart LR
  A[Admin sets PF for trainNo] --> B[POST /api/admin/platforms]
  B --> C[Write platform_overrides.json]
  C --> D[Next /api/trains merge applies override]
  D --> E[Badge highlight on board]
```

## Refresh enable / disable (PDS)

```mermaid
flowchart TD
  A[Admin Start or Stop service] --> B[POST /api/refresh/start or stop]
  B --> C[Update config.refreshEnabled]
  C --> D[Enable or disable EventBridge rule]
  D --> E[Refresh Lambda skips if disabled]
```

## Error / retry (Coach static path)

```mermaid
flowchart TD
  A[Fetch board JSON] --> B{HTTP 200 and JSON?}
  B -->|No| C[Try legacy coach_board_cache.json if BG]
  C -->|Fail| D[Show Unable to load]
  B -->|Yes| E[Render]
```

## Flows not present

Registration, OAuth login, payments, order lifecycle, multi-step approvals — **Could not infer / not implemented**.
