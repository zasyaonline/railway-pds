# 15 — Environment Configurations

## Rule

Document **variable names** only. Never commit or paste production secret values here.

## Runtime environment variables

| Name | Used by | Purpose |
|------|---------|---------|
| `PORT` | Express servers | Listen port |
| `ADMIN_KEY` | PDS/Coach admin | Shared admin secret |
| `COACH_ADMIN_KEY` | PDS Lambda coach routes | Separate Coach admin secret |
| `BUCKET_NAME` | Lambdas | PDS S3 bucket |
| `COACH_BUCKET` | Lambdas | Coach site bucket |
| `REFRESH_RULE_NAME` | API Lambda | EventBridge rule to enable/disable |
| `REFRESH_FUNCTION_NAME` | API Lambda | Refresh function name (meta) |
| `COACH_LOOKAHEAD_HOURS` | Coach Express | Override lookahead |
| `COACH_SHARD_MOD` | Coach poller | Station sharding modulus |
| `COACH_STATION` | refresh-live-cache.js | Single-station refresh |
| `COACH_DISPLAY` | refresh scripts | Display id for build |
| `LOOKAHEAD_HOURS` | refresh scripts | NTES hours |
| `COACH_SITE_BUCKET` | publish scripts | Target bucket |
| `COACH_CF_DIST` | publish scripts | Distribution id |
| `STACK_NAME` | deploy.sh | CFN stack |
| `AWS_REGION` / `AWS_PROFILE` | CLI | Region / profile |
| `CUSTOM_DOMAIN` | deploy | Domain override |
| `WAIT_FOR_CERT` | deploy | Wait ACM validation |

## GitHub Actions secrets (names)

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

## Client config (public files)

### `public/config.js`

- `API_BASE` — empty = same origin
- `REFRESH_MS`

### `coach-position/public/config.js`

- `API_BASE` — empty on CloudFront (TV static path)
- `LOOKUP_BASE` — execute-api base for Search/Save
- `REFRESH_MS`, `LANG_ROTATE_MS`

## Data config (not env)

Station behaviour also lives in JSON (`data/config.json`, Coach `displays.json`). Changing station in admin updates JSON in S3.

## `.env` files

**Could not infer** a committed `.env.example`. Local defaults are hardcoded fallbacks in code + `data/*.json`.
