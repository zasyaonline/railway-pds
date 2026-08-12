# Charlapalli Railway PDS

Passenger Display System (POC) for **Charlapalli station (CHZ)**, showing trains that start, arrive at, or pass through the station using NTES live data.

| Surface | URL |
|---|---|
| Live display | https://platform.zasya.online |
| Admin (sessions) | https://platform.zasya.online/admin.html |
| Coach Position (model) | [docs/coach-position/](docs/coach-position/) — planned host https://coach-position.zasya.online |
| Coach Position (app) | [coach-position/](coach-position/) — local `:3001`, Cloudflare DNS in [coach-position/INFRA.md](coach-position/INFRA.md) |

Admin key default: `chz-ops` (override with `ADMIN_KEY` on deploy / Lambda env).

---

## Architecture

Fully serverless on AWS (region `ap-south-1`, single CloudFormation stack **`railway-pds-chz`**):

| Component | Resource | Purpose |
|---|---|---|
| Static site | **S3** `railway-pds-chz-pdsbucket-...` | Hosts the display + admin pages (`public/`) and `data/*.json` |
| CDN + HTTPS | **CloudFront** `EVTX6GW0ROE2O` (alias `platform.zasya.online`) | Serves the site and proxies `/api/*` to the HTTP API |
| Backend API | **API Gateway (HTTP)** `2j7ifmjjyb` + **Lambda** `railway-pds-CHZ-api` | Trains, health, refresh, sessions, station switch, platform overrides |
| Live data fetch | **Lambda** `railway-pds-CHZ-refresh` | Pulls NTES data, writes live board JSON to S3 |
| Scheduler | **EventBridge rule** `railway-pds-CHZ-refresh-schedule` | Triggers the refresh Lambda every 1 minute |
| Certificate | **ACM** (in `us-east-1`) | TLS for the custom domain (CloudFront requires us-east-1) |

The browser display polls `/api/trains` every 30s through CloudFront. Each open tab registers a **viewer session** so the admin page can list and stop active displays. The station comes from `data/config.json`. The display pages **5 trains** at a time (pool up to `displayCount`, default 10), rotates pages every 10s, and cycles UI language **EN → TE → HI** every 10s.

---

## Display features

| Feature | Behaviour |
|---|---|
| IR branding | Header logo + favicon from `public/img/ir-logo.svg`; tab title becomes `{Station} Railway Station` |
| Paging | Shows up to **6** rows; a second page appears only when more than 6 eligible trains exist. Rotation is language-wise: EN pages, then TE pages, then HI pages (about every `pageIntervalSeconds`, default 10) |
| Languages | Station title (from `data/stations.json` master) + column/status labels rotate EN/TE/HI; train names stay NTES English |
| Platform override hint | Manually overridden PF badges are highlighted on the board |

Config keys in `data/config.json`: `displayCount`, `pageSize`, `pageIntervalSeconds`, `languageRotateSeconds`, `languages`.

---

## Admin panel

Open **https://platform.zasya.online/admin.html** and enter the admin key.

| Action | What it does |
|---|---|
| Active sessions table | Shows each browser tab: start time, how long it has been running, last seen, browser |
| **Stop** / **Stop all sessions** | Ends that display tab (board shows stopped + Reconnect) |
| **Start / Stop service** | Enables or pauses NTES live refresh for everyone |
| **Display station** | Validate NTES code and switch the live board (English name from NTES) |
| **Platform overrides** | Set/clear last-minute PF for trains on the current board |

### Display station

Switch the live board station without redeploying:

1. Pick a **preset** from the curated master (`data/stations.json`) or enter any NTES code.
2. **Apply station** calls NTES to validate the code and auto-fills the **English** name (free-text name entry is not used).
3. Invalid / unrecognized codes are rejected.
4. Telugu/Hindi station titles come only from the curated master when present — not from machine translation.

This updates `data/config.json` and triggers an immediate NTES refresh. Open display tabs pick up the new station on their next poll (~30s).

While you type a station code, the admin form is not overwritten by the sessions auto-refresh.

### Platform overrides

Stored in S3 as `data/platform_overrides.json`. Applied when building the display list (over NTES PF). Stale train numbers are pruned when the board or admin platforms API is served. Overrides appear on the public display within one poll cycle.

### Other notes

- Idle tabs drop off the list after ~90 seconds without a heartbeat.
- Session stop returns HTTP **409** (not 403) so CloudFront's SPA `403 -> index.html` rule does not break Safari.
- `/api/*` must use an origin request policy that forwards viewer headers/query strings (e.g. `Managed-AllViewerExceptHostHeader`) so `X-Admin-Key` / `sessionId` reach Lambda.

---

## Repository layout

```
infra/       CloudFormation templates (template.yaml, certificate.yaml)
lambda/      Lambda source (api + refresh handlers)
public/      Static display + admin UI
routes/      Express routes (local server)
services/    NTES + merge + sessions + station catalog + platform overrides
scripts/     build-lambda.sh, deploy.sh, ensure-certificate.sh
server.js    Local Express server for development
data/        config.json, stations.json, platform_overrides.json, trains.json
```

---

## Local development

```bash
npm install
npm start          # Express server on http://localhost:3000
# Admin: http://localhost:3000/admin.html  (key: chz-ops or $ADMIN_KEY)
```

Node 22+ is preferred (`engines` in `package.json`); Node 20 usually works for local runs.

---

## Deploy to AWS

Prerequisites: AWS credentials for account `884000107109` (profile with enough rights to update Lambda/S3/API/CloudFront; full stack updates that touch IAM roles need broader IAM than `PowerUserAccess` alone) and DNS access to `zasya.online` (Cloudflare).

```bash
# Optional: override admin key
ADMIN_KEY='your-secret' ./scripts/deploy.sh

# First deploy (creates ACM cert; add the validation CNAME in Cloudflare when prompted)
./scripts/deploy.sh

# Once the cert validation CNAME is added, complete the deploy
WAIT_FOR_CERT=true ./scripts/deploy.sh
```

The deploy script builds the Lambda, uploads artifacts, deploys the stack, syncs the static site, invalidates CloudFront, and triggers an initial NTES refresh. It prints the final Cloudflare CNAME to add:

```
Type   : CNAME
Name   : platform
Target : <CloudFrontDomain>   (e.g. d2t8ql6frvtke2.cloudfront.net)
Proxy  : OFF (DNS only / grey cloud) - required for ACM + CloudFront
```

CI: `.github/workflows/deploy.yml` runs the same deploy via `workflow_dispatch`.

If CloudFormation cannot update the Lambda execution role (IAM boundary on the deploy user), update Lambda code, API routes, and S3 static files directly with the AWS CLI instead of a full stack deploy.

---

## Operations: Stop & Start (pause without deleting)

Because the stack is serverless, **disabling** it drops cost to ~$0 while keeping everything in place for an instant restart. Nothing is deleted, so no redeploy is needed.

All commands use region `ap-south-1`. IDs below match the current stack; if the stack is redeployed you can look them up dynamically (see [Look up IDs](#look-up-ids)).

### STOP (make the URLs stop working)

```bash
# 1. Turn off the 1-minute NTES refresh
aws events disable-rule --name railway-pds-CHZ-refresh-schedule --region ap-south-1

# 2. Disable CloudFront so platform.zasya.online AND the *.cloudfront.net URL stop serving
ETAG=$(aws cloudfront get-distribution-config --id EVTX6GW0ROE2O --query ETag --output text)
aws cloudfront get-distribution-config --id EVTX6GW0ROE2O --query DistributionConfig > cf.json
python3 -c "import json;c=json.load(open('cf.json'));c['Enabled']=False;json.dump(c,open('cf.json','w'))"
aws cloudfront update-distribution --id EVTX6GW0ROE2O --distribution-config file://cf.json --if-match "$ETAG"
rm -f cf.json
```

CloudFront takes ~3-5 min to propagate. When `Status` = `Deployed` and `Enabled` = `false`, the URLs return an error.

### START (bring it back live)

```bash
# 1. Re-enable CloudFront
ETAG=$(aws cloudfront get-distribution-config --id EVTX6GW0ROE2O --query ETag --output text)
aws cloudfront get-distribution-config --id EVTX6GW0ROE2O --query DistributionConfig > cf.json
python3 -c "import json;c=json.load(open('cf.json'));c['Enabled']=True;json.dump(c,open('cf.json','w'))"
aws cloudfront update-distribution --id EVTX6GW0ROE2O --distribution-config file://cf.json --if-match "$ETAG"
rm -f cf.json

# 2. Re-enable the 1-minute NTES refresh
aws events enable-rule --name railway-pds-CHZ-refresh-schedule --region ap-south-1
```

Wait ~3-5 min after enabling CloudFront for the site to go live again.

### Check status

```bash
aws cloudfront get-distribution --id EVTX6GW0ROE2O \
  --query "Distribution.{Enabled:DistributionConfig.Enabled,Status:Status}"

aws events describe-rule --name railway-pds-CHZ-refresh-schedule --region ap-south-1 \
  --query "{Rule:Name,State:State}"
```

### Look up IDs

If the stack was redeployed and IDs changed:

```bash
aws cloudformation describe-stacks --stack-name railway-pds-chz --region ap-south-1 \
  --query "Stacks[0].Outputs[?OutputKey=='DistributionId' || OutputKey=='RefreshFunctionName'].{Key:OutputKey,Value:OutputValue}" \
  --output table
```

### Permanent teardown (only if you no longer need it)

> Deletes all resources. Redeploying requires running `./scripts/deploy.sh` again.

```bash
aws cloudformation delete-stack --stack-name railway-pds-chz --region ap-south-1
```

---

## Cost

Serverless, pay-per-use. At POC traffic levels this stack costs **well under $1/month**, and when paused (CloudFront disabled + schedule off) it is effectively **$0** apart from a few cents of S3 storage. There is no EC2/RDS/ALB and no Route 53 hosted zone in this account, so there are no fixed hourly charges.

---

## Custom domain troubleshooting

If the `*.cloudfront.net` URL works but `platform.zasya.online` does not:

1. **CNAME on distribution** - `platform.zasya.online` must be listed under CloudFront -> Settings -> Alternate domain names (CNAMEs).
2. **Certificate** - an ACM cert covering `platform.zasya.online`, issued in **us-east-1**, must be attached.
3. **DNS** - in Cloudflare, `platform` CNAME -> the CloudFront domain, with **proxy OFF (grey cloud)**.
4. **Propagation** - allow 5-30 min after DNS/cert changes.

Diagnose:

```bash
dig platform.zasya.online CNAME +short     # should return the cloudfront.net domain
curl -Iv https://platform.zasya.online      # check TLS handshake / status
curl -s https://platform.zasya.online/api/health
```

If admin shows **Invalid admin key** while the key is correct, confirm the `/api/*` CloudFront behavior forwards viewer headers (origin request policy). Without that, `X-Admin-Key` never reaches Lambda.
