# CHANGELOG — As-Built Documentation Suite

## 1.1.0 — 2026-08-25

Delta refresh after Coach Position UI / BG station delivery (Aug 22–24):

- Documented **three Coach presentation themes**: Current TV (`/`), Premium TV (`/premium.html`), Chart (`/chart.html`) — shared `app.js`, footer theme nav
- Documented **BG entrance-main cross-platform wayfinding**: PF1 amenities + pin when train is on PF2/PF3; FOB graphic anchored to PF1 survey markers (not pin+178 m); 178 m remains banner copy only
- Documented **frozen walk distance/time** CSS (±90° rotation, platform side of yellow line) applying to all themes
- Updated frontend file map, production URLs, module map, known issues (resolved FOB placement)
- Clarified UI publish path: `git push` ≠ live; `coach-position/scripts/publish-ui.sh` syncs S3 + CloudFront
- Added workflow: [workflows/coach-cross-platform-wayfinding.md](./workflows/coach-cross-platform-wayfinding.md)
- Note: `Merged_*_AsBuilt.md` concatenations remain **1.0.0 snapshots** — prefer numbered docs as source of truth until regenerated

## 1.0.0 — 2026-08-21

- Initial complete as-built pack under `docs/as-built/`
- Covers PDS + Coach Position monorepo from live codebase
- Includes architecture, APIs, JSON data model, DevOps, security, ops, troubleshooting
- Mermaid diagrams under `diagrams/`, `erd/`, `workflows/`
- Marks N/A for DB/RBAC/Docker/WebSockets/queues where absent
- Records option B (Coach on PDS Lambdas) and IAM CoachBucketAccess gate
