# Coach Position — Infrastructure & Cloudflare DNS

Separate host from PDS (`platform.zasya.online`).

| | Value |
|---|---|
| Domain | `coach-position.zasya.online` |
| ACM cert | **ISSUED** `arn:aws:acm:us-east-1:884000107109:certificate/e445e1e1-ff67-468c-a341-5cb510bef503` |
| CloudFront | `E12U4PGOD25ISI` → `d1eozsdsb11ew0.cloudfront.net` |
| S3 | `railway-coach-position-site-884000107109` |
| Admin key | `coach-ops` |
| API Lambda | Pending IAM (`PassRole` / `CreateRole` blocked for `cursoruser`) — UI uses static board fixture fallback |

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

- https://coach-position.zasya.online/?display=entrance-main  
- https://coach-position.zasya.online/?display=pf2-mid  
- https://coach-position.zasya.online/admin.html  

Works immediately via CloudFront (no custom DNS needed):

- https://d1eozsdsb11ew0.cloudfront.net/?display=entrance-main  

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
# http://localhost:3001/?display=entrance-main
```
