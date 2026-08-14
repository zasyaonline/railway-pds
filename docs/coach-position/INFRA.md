# Coach Position — Infrastructure note

Separate public host from the PDS stack so demos and ops never collide.

| | PDS | Coach Position |
|---|---|---|
| Domain | `platform.zasya.online` | `coach-position.zasya.online` |
| Suggested stack name | `railway-pds-chz` (existing) | `railway-coach-position` (new) |
| Region | `ap-south-1` | `ap-south-1` |
| ACM cert | us-east-1 (CloudFront) | **New** ACM cert in us-east-1 for `coach-position.zasya.online` |
| S3 | Existing PDS bucket | **New** site + data bucket |
| CloudFront | `EVTX6GW0ROE2O` | **New** distribution |
| API | Existing HTTP API (`2j7ifmjjyb`) | **Reuses PDS Lambda** (option B): `/api/coach/displays`, `/api/coach/board`. TVs read S3 JSON; no dedicated Coach Lambda. |

DNS must be lowercase: **`coach-position.zasya.online`** (not `Coach-position…`).

---

## Cloudflare DNS (planned)

```text
Type   : CNAME
Name   : coach-position
Target : <new-cloudfront-domain>.cloudfront.net
Proxy  : OFF (DNS only / grey cloud) — required for ACM + CloudFront
```

Validation CNAME for the ACM certificate will be shown when the cert is requested (same pattern as PDS `ensure-certificate.sh`).

---

## Deploy shape (implementation phase)

1. ACM for `coach-position.zasya.online` in `us-east-1` — done.
2. S3 + CloudFront for the static TV. Poller + Save on existing PDS Lambdas (`COACH_BUCKET`, IAM on coach bucket).
3. Sync static app + `data/station_index.json`, `data/stations/{CODE}/*`.
4. Invalidate CloudFront; smoke `/?station=BG&display=entrance-main`.
5. Keep **PDS** display URL contract unchanged (`platform.zasya.online` / `/api/trains`).

If IAM boundaries block full stack updates (same as PDS), use direct Lambda zip update + S3 sync + route create + invalidation.

---

## Security / ops

- Reuse admin-key header/query pattern (`X-Admin-Key` / `adminKey`); prefer a **distinct** `ADMIN_KEY` env for the coach stack.
- CloudFront `/api/*` origin request policy must forward headers/query (same lesson as PDS sessions).
- Session kill / SPA 403 remapping: prefer **409** for client-stop semantics if sessions are added later.

---

## Local development

```bash
# Planned (implementation phase)
cd coach-position   # or apps/coach-position
npm start           # e.g. http://localhost:3001
# Display: http://localhost:3001/?display=entrance-main
# Admin:   http://localhost:3001/admin.html
```

Fixtures under `docs/coach-position/fixtures/` can drive a static mock before NTES is wired.
