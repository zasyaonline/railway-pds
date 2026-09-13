# 24 — Troubleshooting Guide

## Build / Lambda package

| Symptom | Likely cause | Action |
|---------|--------------|--------|
| `npm install` hangs in sandbox | Network restricted | Retry with network; use `scripts/build-lambda.sh` |
| Missing `coach-services` in zip | Old build script | Rebuild with current `build-lambda.sh` |
| `Cannot find module ntesClient` | Require path not rewritten | Check perl rewrite on liveBoardService |

## Database / data

| Symptom | Action |
|---------|--------|
| Empty Coach board | Confirm `stations/CODE/board.json` exists; run publish:live or wait for poller |
| Wrong station on TV | Check `?station=` query; displays.json stationCode |
| Stale board | Check EventBridge; COACH_BUCKET; IAM; GH backup logs |

## Auth

| Symptom | Action |
|---------|--------|
| Invalid admin key on CF | Origin request policy must forward `X-Admin-Key`; try `?adminKey=` |
| 401 on coach displays | Use `COACH_ADMIN_KEY` / `coach-ops`, not PDS key |
| Sessions empty on Coach CF | Expected without Coach API/sessions on static host |

## API

| Symptom | Action |
|---------|--------|
| HTML 200 instead of JSON for `/api` on Coach CF | No API behaviour on Coach distribution — use LOOKUP_BASE / static JSON |
| `COACH_BUCKET not configured` | Set Lambda env |
| S3 AccessDenied | Attach CoachBucketAccess IAM policy |
| 409 on TV | Session stopped — Reconnect or clear stop |

## Deployment / SSL / DNS

| Symptom | Action |
|---------|--------|
| Cert PENDING_VALIDATION | Add ACM CNAME in Cloudflare |
| Domain not resolving | Add site CNAME to CF domain; grey cloud |
| API works direct but not via CF | Check `/api/*` cache behaviour + origin |

## Docker

N/A — not used.

## WebSockets

N/A — not used.

## Local connection refused

Ensure `npm start` in correct app directory (`:3000` PDS, `:3001` Coach).
