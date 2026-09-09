# 25 — Known Issues & Limitations

## Architectural limitations

| Limitation | Detail |
|------------|--------|
| No RDBMS | Concurrent admin writes can last-write-wins |
| No real user IAM | Shared admin keys only |
| NTES dependency | Composition gaps (esp. some MEMUs) |
| Coach CF without `/api` | Sessions/stop limited on static host |
| Dual pollers risk | GH Action + Lambda can fight if both active |
| UI deploy is manual | `git push` does not publish Coach HTML/CSS/JS; operators must run `publish-ui.sh` |

## Documented IAM constraint

`cursoruser` cannot create roles / `PassRole` / sometimes `PutRolePolicy`. Dedicated Coach Lambda stack may remain undeployed; option B used instead. Coach S3 access requires **manual admin IAM** attach.

## Doc vs code discrepancies

| Topic | Docs | Code / live data |
|-------|------|------------------|
| Coach hideAfterDepart | MODEL may say 15 | Live defaults **0** |
| Root README Coach host | “planned” wording may lag | Live host documented in INFRA |
| Merged_* AsBuilt dumps | Suite 1.0.0 snapshot | Prefer numbered docs (1.1.0+) |

## Waiting on customer confirmation

| Topic | Current behaviour | Why it is waiting |
|-------|-------------------|-------------------|
| MEMU coach count (e.g. 6 vs 12 icons for 67762) | Each NTES composition token is one coach icon. Do **not** pad 6→12. | Need confirmation whether the field report means 12 **cars** or 12 **wheel-bogies**, plus the raw `arrivalCoachPosition` / `departureCoachPosition` string for that rake. Padding would also move the you-are-here pin. |

## Resolved in delivery (Aug 2026) — keep for audit trail

| Issue | Resolution |
|-------|------------|
| Premium walk labels crossed yellow line | Premium layout clearance; inherit frozen walk CSS |
| Chart theme missing from footer | Restored `/chart.html` + theme-nav on all Coach pages |
| FOB tied to 178 m on short PF2/PF3 rakes | Cross-platform FOB uses PF1 survey markers; 178 m is banner copy only |

## Commercial

RATE_CARD bands are guidance, not negotiated contracts.

## Security limitations

See [16 — Security](./16-security-considerations.md) — CORS `*`, query admin keys, limited audit.

## Browser support

Coach: **Chrome / Edge only** (product decision). Other browsers not validated as TV targets.
