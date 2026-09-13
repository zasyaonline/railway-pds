# 21 — Setup & Installation Guide

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| Node.js | **≥ 22** (`engines` in package.json); 20 often works locally |
| npm | Comes with Node |
| AWS CLI | For deploy / publish |
| AWS credentials | Profile with rights to S3/Lambda/API/CF (IAM role updates need elevated rights) |
| Git | Clone repo |

**Not required:** Docker, database server, Redis.

## Local PDS

```bash
cd /path/to/railway-pds
npm install
npm start
# http://localhost:3000
# Admin: http://localhost:3000/admin.html
# Admin key: <SET_LOCALLY> (documented demo default name chz-ops)
```

Local server hits NTES from Node for live data (see `server.js` refresh behaviour).

## Local Coach Position

```bash
cd coach-position
npm install
npm start
# http://localhost:3001/?station=BG&display=entrance-main
# Admin: http://localhost:3001/admin.html
# Admin key: <SET_LOCALLY> (documented demo default name coach-ops)
```

## Build Lambda package

```bash
# from repo root
npm run build:lambda
# → dist/lambda.zip
```

## Publish Coach static (AWS)

```bash
cd coach-position
npm run publish:ui      # UI
npm run publish:live    # NTES refresh + data sync + invalidate
```

Requires AWS credentials and bucket/distribution env defaults in scripts.

## Tests

**Could not infer** an automated test suite (`npm test` not defined). Validate via health endpoints and manual TV/admin smoke tests.

## Troubleshooting install

| Issue | Action |
|-------|--------|
| `ERR_CONNECTION_REFUSED` | Ensure `npm start` running on correct port |
| NTES failures | Check outbound network; not a browser CORS issue on server path |
| Admin invalid key | Confirm env/default; CF header forwarding in prod |
