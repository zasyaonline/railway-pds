# 10 — API Documentation

Base URLs (as documented in repo):

| Environment | Base |
|-------------|------|
| PDS production (via CF) | `https://platform.zasya.online` |
| HTTP API direct | `https://2j7ifmjjyb.execute-api.ap-south-1.amazonaws.com` |
| Local PDS | `http://localhost:3000` |
| Local Coach | `http://localhost:3001` |

Auth: header `X-Admin-Key` or query `adminKey` / `key`. Viewer: `X-Session-Id` or `sessionId`.

Quick reference: [api/endpoint-catalog.md](./api/endpoint-catalog.md).

---

## PDS — Display & health

### `GET /api/trains`

| | |
|--|--|
| Auth | Optional session registration |
| Description | Current display train list + meta |
| Query | `sessionId` |
| Success | `{ stationCode, stationName, trains[], lastUpdated, languages, pageSize, ... }` |
| Errors | `409` session_stopped; `503` failure |

### `GET /api/health`

| | |
|--|--|
| Auth | None |
| Description | Status snapshot |
| Success | `{ status, refreshEnabled, boardTrainCount, activeSessions, stationCode, ... }` |

### `GET /api/refresh/status`

Refresh enabled flag and interval meta.

### `POST /api/refresh/start` / `POST /api/refresh/stop`

Enable/disable NTES refresh (updates config + EventBridge rule in Lambda path).

---

## PDS — Admin

All require admin key (`ADMIN_KEY`, default local fallback `chz-ops`).

### `GET /api/admin/sessions`

Active viewer sessions + station presets meta.

### `POST /api/admin/sessions/stop`

Body: `{ "sessionId": "..." }` → stop one.

### `POST /api/admin/sessions/stop-all`

Stop all sessions.

### `POST /api/admin/station`

Body: `{ "stationCode": "CHZ" }` — NTES validate, update `config.json`.

### `GET /api/station-lookup`

Query: `code` — public/lookup style resolve (used by Coach Search). Returns `{ stationCode, stationName, trainCount }`.

### `GET /api/admin/platforms` / `POST /api/admin/platforms` / `POST /api/admin/platforms/clear`

Read/set/clear platform overrides.

---

## Coach — Production via PDS Lambda (option B)

Coach admin key: `COACH_ADMIN_KEY` (fallback `coach-ops`). Requires `COACH_BUCKET`.

### `GET /api/coach/displays?station=`

Returns displays document for station.

### `POST /api/coach/displays`

Body may include `stationCode`, `stationName`, window fields, and optional `display` object (`id`, `name`, `mode`, `platformsShown`, `youAreHere`).

Writes `stations/{CODE}/displays.json` and upserts `station_index.json`.

### `GET /api/coach/board?station=&display=`

**Debug/admin:** reads S3 board cache and overlays display — **does not call NTES**.

---

## Coach — Local Express (`:3001`)

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/health` | No | Includes station list meta |
| GET | `/api/coach-board` | Session optional | **Live NTES** build |
| GET | `/api/coach-types` | No | Type catalog |
| GET | `/api/coach/board` | No | Cached overlay |
| GET/POST | `/api/admin/displays` | Admin | Same as coach/displays handlers |
| GET/POST | `/api/coach/displays` | Admin | Per-station save |
| GET | `/api/admin/station-lookup` | Admin | NTES name |
| GET/POST | `/api/admin/sessions*` | Admin | Local sessions |

---

## Error shapes (typical)

```json
{ "error": "Admin key required" }
{ "error": "session_stopped", "message": "This display session was stopped by an administrator" }
{ "error": "COACH_BUCKET not configured" }
```

## Rate limiting

**Could not infer from codebase** — no application-level rate limiter. Rely on API Gateway / CloudFront defaults if any.

## CORS

Lambda responses set `Access-Control-Allow-Origin: *` and allow `Content-Type`, `X-Session-Id`, `X-Admin-Key`.
