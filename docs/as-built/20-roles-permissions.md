# 20 — Roles & Permissions

## Status

**No RBAC / roles engine** in code.

## Effective roles (conceptual)

| Role | Capabilities |
|------|--------------|
| Public viewer | Open display URLs; read public JSON/API trains |
| Ops admin (PDS key) | Sessions, station switch, PF overrides, (refresh controls) |
| Ops admin (Coach key) | Coach displays read/write on `/api/coach/*` |
| Cloud admin | IAM, deploy, bucket policies |

## Permission matrix

See [11 — Authentication & Authorization](./11-authentication-authorization.md).

## Separation of keys

PDS `ADMIN_KEY` and Coach `COACH_ADMIN_KEY` are intentionally separate env vars so Coach ops credentials are not forced to equal PDS keys.
