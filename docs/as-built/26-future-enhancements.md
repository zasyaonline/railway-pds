# 26 — Future Enhancements & Scalability

## Product / UX

- Multi-station PDS URL (`?station=`) to match Coach contract
- Stronger Coach session control on production without local Express
- Additional station layouts (amenities/FOB) beyond BG survey
- Better handling when no rake available (messaging)
- Optional auto-publish Coach UI from CI (today: manual `publish-ui.sh`)

## Platform

- Enable S3 versioning + backup automation
- CloudWatch alarms on refresh errors / board staleness
- Secrets Manager for admin keys
- WAF + tighter CORS
- Disable GH coach-refresh schedule once Lambda poller proven
- Optional dedicated Coach stack (option A) when IAM allows

## Scale to 30+ stations

- Keep poller-per-station; shard `COACH_SHARD_MOD`
- Cache board JSON 30–60s at CloudFront
- Avoid Lambda-per-TV models (cost)
- One device licence per screen (RATE_CARD)

## Data

- Formalize JSON Schema validation in CI
- Retire BG legacy aliases after all TVs use per-station paths

## Not recommended without redesign

- Browser-direct NTES
- Station PC servers
- Per-TV API Gateway hammering every 15s
