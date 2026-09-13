# AWS cloud stack — pause and restore

The station PC (local appliance) does **not** depend on AWS. Pausing AWS only stops `platform.zasya.online` and `coach-position.zasya.online`.

Nothing below is deleted. Restore is enable + wait, not a rebuild.

Account: `884000107109` (`cursoruser`). Region: `ap-south-1` (ACM for CloudFront is `us-east-1`).

## What must stay

| Item | Why |
|------|-----|
| Git: `railway-pds` + `railway-station-display` | Code, Lambda zip source, UI, deploy scripts |
| CloudFormation stack `railway-pds-chz` | API Gateway, Lambdas, EventBridge rule, PDS bucket, platform CloudFront |
| S3 buckets (all four) | Static sites + Lambda zip + board JSON |
| ACM certs (ISSUED) | Custom-domain HTTPS |
| Cloudflare CNAMEs (grey cloud) | `platform` → `d2t8ql6frvtke2.cloudfront.net`, `coach-position` → `d1eozsdsb11ew0.cloudfront.net` |
| Lambda env vars | Already on the functions; do not clear them |
| GitHub secrets `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Manual `workflow_dispatch` deploy later |
| AWS CLI profile `cursoruser` | Pause / resume from this Mac |

Do **not** run `aws cloudformation delete-stack`. That would require a full `./scripts/deploy.sh` and DNS/cert re-check.

## Inventory (as of 2026-09-04)

| Resource | ID / name |
|----------|-----------|
| PDS CloudFront | `EVTX6GW0ROE2O` · `platform.zasya.online` · `d2t8ql6frvtke2.cloudfront.net` |
| Coach CloudFront | `E12U4PGOD25ISI` · `coach-position.zasya.online` · `d1eozsdsb11ew0.cloudfront.net` |
| HTTP API | `https://2j7ifmjjyb.execute-api.ap-south-1.amazonaws.com` |
| API Lambda | `railway-pds-CHZ-api` (nodejs22.x) |
| Refresh Lambda | `railway-pds-CHZ-refresh` (nodejs22.x, 300s) |
| EventBridge | `railway-pds-CHZ-refresh-schedule` · `rate(1 minute)` |
| PDS bucket | `railway-pds-chz-pdsbucket-okhzoeutwidk` |
| Coach site bucket | `railway-coach-position-site-884000107109` |
| Coach leftover bucket | `railway-coach-position-sitebucket-ojrsqwv3rdyu` (unused by current publish script) |
| Artifacts | `railway-pds-artifacts-884000107109` (`lambda.zip`) |
| ACM | `platform.zasya.online`, `coach-position.zasya.online` (us-east-1, ISSUED) |

Lambda environment **names** (values stay on AWS; admin keys are not stored in git):

- API: `ADMIN_KEY`, `BUCKET_NAME`, `COACH_ADMIN_KEY`, `COACH_BUCKET`, `REFRESH_RULE_NAME`
- Refresh: `BUCKET_NAME`, `COACH_BUCKET`

Deploy path: `./scripts/deploy.sh` (stack `railway-pds-chz`). Coach UI: `bash coach-position/scripts/publish-ui.sh`. Lambda zip: `npm run build:lambda`.

## Pause (stop billing for traffic + NTES)

```bash
export AWS_PROFILE=cursoruser
bash scripts/aws-pause.sh
gh workflow disable "Refresh Coach Position cache"   # if the GitHub Action is still scheduled
```

CloudFront disable takes a few minutes (`Status=Deployed`, `Enabled=false`).

## Restore later

```bash
export AWS_PROFILE=cursoruser
bash scripts/aws-resume.sh
# optional: re-enable the backup GitHub poller only if Lambda coach write is not used
# gh workflow enable "Refresh Coach Position cache"
```

Wait until both distributions are `Enabled=true` and `Status=Deployed`, then:

```bash
curl -sS https://platform.zasya.online/api/health
curl -sS -o /dev/null -w '%{http_code}\n' 'https://coach-position.zasya.online/chart.html?station=BG&display=entrance-main'
aws events describe-rule --name railway-pds-CHZ-refresh-schedule --region ap-south-1 --query State --output text
```

If the stack template drifted, update code with `npm run build:lambda` + `aws lambda update-function-code`, then `coach-position/scripts/publish-ui.sh` and PDS `scripts/deploy.sh` S3 sync as needed. DNS and ACM should already be valid.
