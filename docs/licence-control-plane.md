# Licence control plane — PAUSED

Do not implement this until Phase 4 (full appliance test including TTS announcements) has passed.

Existing local licence verification stays as-is: signed `keys/licence.json` on the appliance, sample BG licence still used by [`deployment/ubuntu/install.sh`](../deployment/ubuntu/install.sh).

## When unpaused

- Public repo stays the software channel. Clones are not an install count.
- Source of truth: issued `licenceId` rows (sheet, then SQLite/Workbench): station, dates, overlay version, ISSUED / ACTIVE / EXPIRED / REVOKED.
- Keep issuing with [`deployment/scripts/licence-issue.js`](../deployment/scripts/licence-issue.js). Private key never on the appliance.
- Stop shipping a long-lived sample licence on public `main`. Installer should require an issued file.
- Optional `installationId` is already in [`edge/licence/schema.js`](../edge/licence/schema.js).
- Optional non-blocking heartbeat. Never required for passenger displays.
- Overlay packs may be signed later with the same key (`stationCode` must match).

Until that work resumes, count installs by ops (who received a USB/licence), not GitHub traffic.
