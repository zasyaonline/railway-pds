# Coach Position display

Large-TV coach rake + “You are here” for a station (default **Bhongir / BG**).

Live URL: https://coach-position.zasya.online

## Data source

**NTES Live Station only** (`TrainsAtStationJson`). That board lists **halting** trains at the configured station — pass-through trains (e.g. 12714 at BG) do not appear.

Coach order and Divyangjan positions come from the same live row:

- `departureCoachPosition` / `arrivalCoachPosition`
- `depPWDCoachPosition` / `arrPWDCoachPosition`

No demo board is used for the public display.

## Local

```bash
cd coach-position
npm start
# http://localhost:3001/?display=entrance-main
# Admin key: coach-ops
```

API hits NTES on each `/api/coach-board` request. Display tabs send `sessionId`; admin can list and stop them.

## Static site cache refresh

CloudFront serves `data/coach_board_cache.json` (public `config.js` has `API_BASE: ''`). The TV re-picks the featured rake from the wall clock vs `stationBoard` every minute, so a departed train is dropped even if the cache is a few minutes old. Refresh from NTES and publish:

```bash
npm run publish:live
```

That writes the cache, syncs `data/` to `railway-coach-position-site-884000107109`, and invalidates `/data/*`.

Publish display JS/CSS/i18n after UI changes:

```bash
npm run publish:ui
```

GitHub Action `.github/workflows/coach-refresh.yml` runs the cache job every 5 minutes (`workflow_dispatch` available). Window rules: **T−10 preferred**; if nobody is in that window, feature the **next future halt** (kicker `Next`, not `Next arrival`); once departure time has passed the train is gone.

Language rotates EN → TE → HI every 15s (chrome, status, coach type labels, station names from `data/stations.json`).

## Admin

1. Open `http://localhost:3001/admin.html` (key `coach-ops`). The live CloudFront admin cannot call NTES.
2. Enter the station **code** (e.g. `PUNE`) and click **Search** — NTES fills the name.
3. Click **Save station**, then **Open display**.

The display title and live train list use the saved code. CloudFront TVs still read `coach_board_cache.json` until `npm run publish:live`.

**Display sessions** (PDS-style): active count, Stop, Stop all. Idle tabs drop off after ~90s. Stopping a session blanks that TV.

- Full control on local `:3001` and a future API Lambda.
- On CloudFront without API the session list stays empty; the static cache still drives the TV.
