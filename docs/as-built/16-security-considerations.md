# 16 — Security Considerations

## Security architecture (as-built)

| Control | Implementation |
|---------|----------------|
| Transport | HTTPS via CloudFront + ACM |
| Origin access | S3 private + CloudFront OAC |
| Admin API | Shared secret header/query |
| Viewer control | Session kill switch |
| NTES | Server-side only (Lambda/Express); not from browser |

## Threat mitigations present

| Risk | Mitigation |
|------|------------|
| Public S3 listing | Bucket not public; OAC |
| Browser → NTES | Not used on Coach CF path; CORS/cost avoided |
| Admin CSRF | No cookies for admin; key must be sent (still shareable if leaked) |
| XSS | Mostly text via DOM APIs; review any `innerHTML` usages on change |
| Injection | No SQL; JSON parse with try/catch; codes normalized |
| Session spoof | Knowing session id can heartbeat; stop requires admin key |

## Gaps / hardenings recommended

| Gap | Recommendation |
|-----|----------------|
| Shared static admin keys | Rotate; store in Secrets Manager; different per env |
| Admin key in query string | Prefer header only; query used as CF fallback |
| CORS `*` | Restrict to known display origins if feasible |
| Refresh start/stop auth | Confirm intended; lock to admin if not |
| No WAF documented | Consider AWS WAF on CloudFront |
| No rate limit in app | API Gateway throttling |
| Credentials files | Ensure `.aws/` secrets never committed |

## File upload

**Not implemented** — no user upload endpoints.

## Audit logging

CloudWatch Logs for Lambda (basic). No structured audit trail of admin actions beyond console logs — **limited**.

## Secret management

Env vars on Lambda; GitHub secrets for CI. Mask all values in docs and tickets.
