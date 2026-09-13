# PROJECT_DOCUMENTATION_STATUS

| Field | Value |
|-------|-------|
| Suite version | 1.1.0 |
| Generated | 2026-08-21 |
| Last refreshed | 2026-08-25 |
| Codebase scanned | `railway-pds` monorepo (root PDS + `coach-position/`) |
| Refresh type | Delta — Coach Position themes, BG cross-platform FOB/walk, publish-ui |

## Generated sections

| Section | File | Confidence | Notes |
|---------|------|------------|-------|
| Index | README.md | High | Suite 1.1.0; three Coach themes |
| Executive | 01 | High | Premium + cross-platform FOB capability |
| Business | 02–04 | High | 04 solution + publish-ui workflow |
| Architecture | 05, 12–13 | High | 12 rewritten for themes + frozen walk |
| Business logic / flows | 06–08 | High | Cross-platform rules in 06; module map |
| Data store | 09 + erd/ | High | layout.json linked in ERD |
| API | 10 + api/ | High | Unchanged this refresh |
| Auth | 11, 19–20 | High | No RBAC — explicitly N/A |
| DevOps / env | 14–15, 21–23 | High | publish-ui clarified; Premium URL |
| Security / logging | 16–17 | Medium | Alarms not in code |
| Integrations | 18 | High | Unchanged |
| Troubleshooting / gaps | 24–26 | High | Resolved FOB/walk items in 25 |
| Diagrams | diagrams/, erd/, workflows/ | High | New cross-platform workflow |
| Status / changelog | this + CHANGELOG | High | |

## Pending / N/A (by design)

| Topic | Status |
|-------|--------|
| Relational ERD from migrations | N/A — no DB |
| OpenAPI/Swagger generated | Pending — catalog is Markdown only |
| Automated test report | N/A — no test suite found |
| Staging environment matrix | Could not infer dedicated staging |
| Confirmation dedicated Coach CFN stack live | Manual verification required |
| Cloudflare CNAME live for coach-position | Manual verification required |
| S3 versioning enabled | Manual verification required |
| Regenerate `Merged_*_AsBuilt.md` | Pending — numbered docs are SoT for 1.1.0 |

## Assumptions

1. Public domains and AWS IDs in README/INFRA reflect production intent.
2. Option B (PDS Lambdas for Coach Save/poller) is the as-built hosting decision.
3. RATE_CARD figures are commercial guidance.
4. Local Express is for development/demo, not station ops.
5. BG `entrance-main` is the reference cross-platform FOB station; other stations need their own `layout.json` amenity rules.

## Manual verification required

- [ ] Attach/confirm **CoachBucketAccess** IAM on Lambda role
- [ ] Confirm EventBridge coach path writing `stations/*/board.json`
- [ ] Confirm whether GH `coach-refresh` schedule should be disabled
- [ ] Confirm production admin keys rotated from demo names
- [ ] Confirm CloudFront origin request policy still forwards admin/session headers
- [ ] Confirm DNS for both custom domains
- [ ] Customer sign-off on RATE_CARD bands
- [x] Live Coach UI publish after FOB fix (`publish-ui.sh` run 2026-08-24)
- [ ] Spot-check PF2/PF3 train on Current / Premium / Chart after hard-refresh

## Areas requiring human confirmation

- Whether refresh start/stop should remain publicly callable
- Whether dedicated `railway-coach-position-api` was ever deployed
- Exact PDS S3 physical bucket name in account (template-generated suffix)
- Any unpublished operational runbooks outside the repo

## Completion summary (1.1.0)

Delta refresh completed without modifying application runtime code. Updated numbered docs for Premium/Chart themes, frozen walk labels, BG cross-platform FOB (survey markers vs 178 m banner), and UI publish procedure. Added `workflows/coach-cross-platform-wayfinding.md`. Merged concatenation files not regenerated — use numbered docs as source of truth.
