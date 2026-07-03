# Charlapalli Railway PDS

Passenger Display System (POC) for **Charlapalli station (CHZ)**, showing trains that start, arrive at, or pass through the station using NTES live data.

Live display: `https://platform.zasya.online` (custom domain) / CloudFront distribution URL.

---

## Architecture

Fully serverless on AWS (region `ap-south-1`, single CloudFormation stack **`railway-pds-chz`**):

| Component | Resource | Purpose |
|---|---|---|
| Static site | **S3** `railway-pds-chz-pdsbucket-…` | Hosts the display page (`public/`) + `data/*.json` |
| CDN + HTTPS | **CloudFront** `EVTX6GW0ROE2O` (alias `platform.zasya.online`) | Serves the site and proxies `/api/*` to the HTTP API |
| Backend API | **API Gateway (HTTP)** `2j7ifmjjyb` + **Lambda** `railway-pds-CHZ-api` | Routes: `/trains`, `/health`, `/refresh/start|stop|status` |
| Live data fetch | **Lambda** `railway-pds-CHZ-refresh` | Pulls NTES data, writes `trains.json` to S3 |
| Scheduler | **EventBridge rule** `railway-pds-CHZ-refresh-schedule` | Triggers the refresh Lambda every 1 minute |
| Certificate | **ACM** (in `us-east-1`) | TLS for the custom domain (CloudFront requires us-east-1) |

The browser display auto-refreshes every 30s (`REFRESH_MS`) by calling the API through CloudFront.

---

## Repository layout

```
infra/       CloudFormation templates (template.yaml, certificate.yaml)
lambda/      Lambda source (api + refresh handlers)
public/      Static display site
routes/      Express routes (shared local/lambda)
services/    NTES + data services
scripts/     build-lambda.sh, deploy.sh, ensure-certificate.sh
server.js    Local Express server for development
data/        config.json, trains.json
```

---

## Local development

```bash
npm install
npm start          # Express server on http://localhost:3000
```

---

## Deploy to AWS

Prerequisites: `aws login` (credentials for account `884000107109`) and DNS access to `zasya.online` (Cloudflare).

```bash
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
Proxy  : OFF (DNS only / grey cloud) — required for ACM + CloudFront
```

CI: `.github/workflows/deploy.yml` runs the same deploy via `workflow_dispatch`.

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

CloudFront takes ~3–5 min to propagate. When `Status` = `Deployed` and `Enabled` = `false`, the URLs return an error.

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

Wait ~3–5 min after enabling CloudFront for the site to go live again.

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

1. **CNAME on distribution** — `platform.zasya.online` must be listed under CloudFront ? Settings ? Alternate domain names (CNAMEs). (Already configured.)
2. **Certificate** — an ACM cert covering `platform.zasya.online`, issued in **us-east-1**, must be attached.
3. **DNS** — in Cloudflare, `platform` CNAME ? the CloudFront domain, with **proxy OFF (grey cloud)**.
4. **Propagation** — allow 5–30 min after DNS/cert changes.

Diagnose:

```bash
dig platform.zasya.online CNAME +short     # should return the cloudfront.net domain
curl -Iv https://platform.zasya.online      # check TLS handshake / status
```
