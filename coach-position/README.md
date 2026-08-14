# Coach Position display

Large-TV coach rake + “You are here” for a station (default **Bhongir / BG**).

Live URL: https://coach-position.zasya.online/?station=BG&display=entrance-main

TVs are **Chrome or Edge only**. There is **no station PC**. The URL is **station + display**.

## Data source

**NTES Live Station only** (`TrainsAtStationJson`). A **cloud poller** (existing PDS refresh Lambda) fetches once per station every 1–2 minutes and writes `/data/stations/{CODE}/board.json`. TVs read that JSON from CloudFront. They never call NTES, localhost, or Lambda.

Coach order and Divyangjan positions come from the same live row:

- `departureCoachPosition` / `arrivalCoachPosition`
- `depPWDCoachPosition` / `arrPWDCoachPosition`

## Local

```bash
cd coach-position
npm start
# http://localhost:3001/?station=BG&display=entrance-main
# Admin key: coach-ops
```

Local `:3001` still hits NTES on `/api/coach-board` for laptop demo. That path is **not** ops.

## Static site cache refresh

CloudFront serves `data/stations/{CODE}/board.json` (public `config.js` has `API_BASE: ''`). The TV re-picks the featured rake from the wall clock vs `stationBoard` every minute. Refresh from NTES and publish:

```bash
npm run publish:live
```

That writes per-station caches (and BG legacy aliases), syncs `data/` to `railway-coach-position-site-884000107109`, and invalidates `/data/*`.

Publish display JS/CSS/i18n after UI changes:

```bash
npm run publish:ui
```

Primary poller: `railway-pds-CHZ-refresh` with `COACH_BUCKET`. GitHub Action `.github/workflows/coach-refresh.yml` is a **backup** until that loop is proven.

Window rules: **T−10 preferred**; if nobody is in that window, feature the **next future halt** (kicker `Next`, not `Next arrival`); once departure time has passed the train is gone.

Language rotates EN → TE → HI every 15s (chrome, status, coach type labels, station names from `data/stations.json`).

Two views share the same live cache:

- TV: `/?station=BG&display=entrance-main`
- Chart: `/chart.html?station=BG&display=entrance-main`

The traveller pin and walk distance/time always show on the featured rake from the display’s entrance position. If that train is on the other platform, a note says so — the pin is not hidden.

The TV layout follows **viewport height**, not OS. Below ~800px CSS height the station table shrinks (and hides below ~600px) so the rake, traveller, and walk labels stay on screen.

## Admin

1. Open `https://coach-position.zasya.online/admin.html` (key `coach-ops`) or `http://localhost:3001/admin.html`.
2. Enter the station **code** (e.g. `PUNE`) and click **Search** — NTES fills the name.
3. Click **Save station**, then **Open display** (`/?station={CODE}&display={id}`).

Save writes `data/stations/{CODE}/displays.json` via the PDS API (`LOOKUP_BASE`). Search uses `GET /api/station-lookup`. CloudFront TVs pick up the next poller’s `board.json`.

**Display sessions** (local only): active count, Stop, Stop all. Idle tabs drop off after ~90s.

Commercial pricing: [docs/coach-position/RATE_CARD.md](../docs/coach-position/RATE_CARD.md).
