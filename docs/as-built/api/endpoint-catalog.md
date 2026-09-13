# API endpoint catalog (quick reference)

| Method | Path | Auth | App |
|--------|------|------|-----|
| GET | `/api/trains` | Session optional | PDS |
| GET | `/api/health` | None | PDS / Coach local |
| GET | `/api/refresh/status` | None | PDS |
| POST | `/api/refresh/start` | None* | PDS |
| POST | `/api/refresh/stop` | None* | PDS |
| GET | `/api/admin/sessions` | Admin | PDS / Coach local |
| POST | `/api/admin/sessions/stop` | Admin | PDS / Coach local |
| POST | `/api/admin/sessions/stop-all` | Admin | PDS / Coach local |
| POST | `/api/admin/station` | Admin | PDS |
| GET | `/api/station-lookup` | None | Shared |
| GET | `/api/admin/platforms` | Admin | PDS |
| POST | `/api/admin/platforms` | Admin | PDS |
| POST | `/api/admin/platforms/clear` | Admin | PDS |
| GET | `/api/coach/displays` | Coach admin | Shared Lambda / Coach local |
| POST | `/api/coach/displays` | Coach admin | Shared Lambda / Coach local |
| GET | `/api/coach/board` | None* | Shared Lambda / Coach local |
| GET | `/api/coach-board` | Session optional | Coach local live |
| GET | `/api/coach-types` | None | Coach local |
| GET | `/api/admin/station-lookup` | Admin | Coach local |

\*Confirm production hardening intent.

Full detail: [10 — API Documentation](../10-api-documentation.md)
