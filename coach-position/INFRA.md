# Coach Position — Infrastructure & Cloudflare DNS

Separate host from PDS (`platform.zasya.online`). TVs are Chrome/Edge only. **No station PC.** URL = station + display.

| | Value |
|---|---|
| Domain | `coach-position.zasya.online` |
| ACM cert | **ISSUED** `arn:aws:acm:us-east-1:884000107109:certificate/e445e1e1-ff67-468c-a341-5cb510bef503` |
| CloudFront | `E12U4PGOD25ISI` → `d1eozsdsb11ew0.cloudfront.net` |
| S3 | `railway-coach-position-site-884000107109` |
| Admin key | `coach-ops` (`COACH_ADMIN_KEY` on PDS Lambda) |
| Poller + Save | Existing PDS Lambdas `railway-pds-CHZ-refresh` + `railway-pds-CHZ-api` (option B). Env `COACH_BUCKET` + IAM on this site bucket. |
| TV data | CloudFront JSON `/data/stations/{CODE}/board.json` — TVs never call NTES or Lambda |

Canonical TV URL:

`https://coach-position.zasya.online/?station=BG&display=entrance-main`

---

## Cloudflare DNS — site CNAME (**add now**)

Validation CNAME is done. Add the **site** record:

| Field | Value |
|---|---|
| **Type** | `CNAME` |
| **Name** | `coach-position` |
| **Target** | `d1eozsdsb11ew0.cloudfront.net` |
| **Proxy** | **DNS only** (grey cloud) |

After DNS propagates (often a few minutes):

- https://coach-position.zasya.online/?station=BG&display=entrance-main
- https://coach-position.zasya.online/?station=BG&display=pf2-mid
- https://coach-position.zasya.online/admin.html

Works immediately via CloudFront (no custom DNS needed):

- https://d1eozsdsb11ew0.cloudfront.net/?station=BG&display=entrance-main

---

## S3 keys

- `data/station_index.json` — poller roster `{ "stations": ["BG"] }`
- `data/stations/{CODE}/displays.json`
- `data/stations/{CODE}/board.json`
- `data/stations/{CODE}/layout.json` (optional)
- Legacy BG aliases (until TVs fully switched): `data/coach_displays.json`, `data/coach_board_cache.json`

Admin Search + Save: PDS HTTP API `https://2j7ifmjjyb.execute-api.ap-south-1.amazonaws.com`

- `GET /api/station-lookup?code=`
- `GET|POST /api/coach/displays?station=`
- `GET /api/coach/board?station=&display=` (debug; reads S3 cache, no NTES)

Coach CloudFront has **no** `/api/*` origin in this phase.

## AWS access (managed in repo)

**PDS Lambda poller** (`railway-pds-CHZ-refresh` + `railway-pds-CHZ-api`) needs read/write on this bucket.

| Layer | Location |
|-------|----------|
| IAM on PDS role | `infra/template.yaml` → `CoachBucketAccess` on `LambdaRole` |
| S3 bucket policy | `infra/coach-site-bucket-policy.json` + `coach-position/infra/template.yaml` `BucketPolicy` |
| Apply without full deploy | `./scripts/apply-coach-iam.sh bucket` (S3 policy; works for `cursoruser`) |
| Full stack | `./scripts/deploy.sh` (PDS) or coach-position `deploy.sh` |

Env on Lambdas: `COACH_BUCKET=railway-coach-position-site-884000107109`, `COACH_ADMIN_KEY=coach-ops`, refresh timeout **300s**.

GitHub Action `.github/workflows/coach-refresh.yml` remains a **backup** until the Lambda poller is proven.

---

## Already added (ACM validation) — keep it

| Field | Value |
|---|---|
| Type | `CNAME` |
| Name | `_bac9484e39a8dcfeeebe532fe51ccc26.coach-position` |
| Target | `_b3bf5c43a1c43e3ba86af7503031f7d6.jkddzztszm.acm-validations.aws.` |
| Proxy | DNS only |

---

## Local demo

```bash
cd coach-position
npm start
# http://localhost:3001/?station=BG&display=entrance-main
```
