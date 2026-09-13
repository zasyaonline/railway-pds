# 17 — Logging & Monitoring

## Logging

| Component | Mechanism |
|-----------|-----------|
| Lambda | `console.log` / `console.error` → CloudWatch Logs |
| Express local | stdout |
| GitHub Actions | Workflow logs |

No dedicated logging agent (Datadog/ELK) in repo.

## Useful log signals

| Signal | Meaning |
|--------|---------|
| `[refresh] CODE: N trains` | PDS poller success |
| `[coach-refresh] CODE: ...` | Coach station success |
| `[coach-refresh] skipped — COACH_BUCKET not set` | Coach poller disabled |
| `[api] error:` | API handler exception |
| AccessDenied on coach bucket | IAM policy missing |

## Monitoring (as-built)

**Could not infer** automated alarms/dashboards from codebase.

### Recommended operational checklist

| Check | How |
|-------|-----|
| PDS health | `GET /api/health` |
| Board freshness | `lastUpdated` / `liveFetchedAt` age |
| Coach JSON | `GET /data/stations/{CODE}/board.json` |
| CloudFront 5xx | AWS console / metrics |
| EventBridge rule enabled | When refresh “stopped” |
| Lambda errors | CloudWatch |

## Health endpoints

- `GET /api/health` (PDS / Coach local)
- Coach production TV health ≈ presence of fresh `board.json`

## Alerting SKU

Optional 24×7 ops retainer described in RATE_CARD (board stale, NTES down, CF 5xx, Slack/phone) — commercial, not implemented as code.
