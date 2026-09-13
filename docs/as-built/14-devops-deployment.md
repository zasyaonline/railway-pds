# 14 — DevOps & Deployment

## Technology stack (DevOps)

| Tool | Use |
|------|-----|
| AWS CloudFormation | `infra/template.yaml`, `certificate.yaml` |
| AWS CLI + bash | `scripts/deploy.sh`, publish scripts |
| GitHub Actions | Deploy dispatch; Coach cache backup cron |
| CloudFront / S3 / Lambda / API Gateway / EventBridge / ACM | Runtime |
| Cloudflare DNS | CNAME to CloudFront |

**No Docker / docker-compose / Kubernetes / Terraform** in repo.

## CI/CD workflows

### `.github/workflows/deploy.yml`

- Trigger: `workflow_dispatch`
- Runs `scripts/deploy.sh` with AWS secrets

### `.github/workflows/coach-refresh.yml`

- Trigger: cron `*/5 * * * *` + `workflow_dispatch`
- Runs `coach-position/scripts/publish-live-cache.sh`
- Documented as **backup** until Lambda coach poller is proven; then disable schedule to avoid dual writers

## Build artifacts

```bash
# From repo root
npm run build:lambda   # → dist/lambda.zip (includes coach-services)
```

Upload to artifacts bucket and `aws lambda update-function-code` (CLI path used when CF IAM updates fail).

## Deploy scripts

| Script | Purpose |
|--------|---------|
| `scripts/deploy.sh` | Full PDS stack deploy |
| `scripts/ensure-certificate.sh` | ACM in us-east-1 |
| `scripts/build-lambda.sh` | Package zip |
| `coach-position/scripts/publish-ui.sh` | Sync Coach static UI (`public/`) to S3 + CloudFront invalidation — **manual after UI commits** |
| `coach-position/scripts/publish-live-cache.sh` | Refresh + sync board/data |
| `coach-position/scripts/deploy.sh` | Dedicated Coach stack (if used) |

**Note:** Pushing to `feature/coach-position` updates GitHub only. Live `coach-position.zasya.online` updates when `publish-ui.sh` (and/or data publish scripts) succeed.

## Infrastructure as code highlights (`infra/template.yaml`)

- Private S3 + OAC
- CloudFront default + `/api/*` behaviour to HTTP API
- Origin request policy forwarding viewer headers for admin/session
- SPA error mapping 403/404 → `index.html` (hence session stop uses 409)
- EventBridge schedule → refresh Lambda
- Lambda env: `BUCKET_NAME`, `ADMIN_KEY`, refresh rule name

## IAM gate (Coach bucket)

Deploy user `cursoruser` historically **cannot** `iam:PutRolePolicy`. Admin must attach **CoachBucketAccess** on role `railway-pds-chz-LambdaRole-*` for Get/Put/List on coach site bucket. Policy JSON: `infra/coach-bucket-iam-policy.json` / `coach-position/INFRA.md`.

## Environments

| Env | How represented |
|-----|-----------------|
| Local | Express + local `data/` |
| Production | Single AWS account resources named in README/INFRA |

No separate staging stack documented as first-class in code — **Could not infer** dedicated staging account.
