# Coach Position display

Large-TV coach rake + **You are here** pin. Model docs: [../docs/coach-position/](../docs/coach-position/).

| | URL |
|---|---|
| Planned prod | https://coach-position.zasya.online |
| Local | http://localhost:3001/?display=entrance-main |
| Admin | /admin.html (`coach-ops`) |

## Quick start

```bash
npm install
npm start
```

## Cloudflare

See [INFRA.md](INFRA.md) for ACM validation + site CNAME records.

## Deploy

```bash
AWS_PROFILE=cursoruser ./scripts/deploy.sh
# After ACM validation CNAME is in Cloudflare:
WAIT_FOR_CERT=true AWS_PROFILE=cursoruser ./scripts/deploy.sh
```
