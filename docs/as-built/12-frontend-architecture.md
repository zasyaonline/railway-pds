# 12 — Frontend Architecture

## Stack

| Layer | Choice | Why (as-built) |
|-------|--------|----------------|
| UI | Static HTML + vanilla JS | Simple TV kiosk; no SPA build pipeline |
| Styling | Shared `style.css` + theme CSS | Full-bleed TV layouts; Premium / Chart overlays |
| i18n | In-browser dictionaries | EN/TE/HI rotation without SSR |
| Build | None (sync to S3) | Deploy = `aws s3 sync` + invalidation |
| Framework | None | Minimal runtime on low-power TVs |

## Applications

### PDS (`public/`)

| File | Role |
|------|------|
| `index.html` | Board shell |
| `admin.html` | Ops panel |
| `js/app.js` | Poll trains, page, languages, sessions |
| `js/admin.js` | Sessions, station, overrides, refresh |
| `js/i18n.js` | `window.PDS_I18N` |
| `config.js` | `API_BASE`, `REFRESH_MS` (30s) |
| `css/*` | Board + admin styles |
| `img/` | IR logo / favicon |

### Coach (`coach-position/public/`)

| File | Role |
|------|------|
| `index.html` | **Current TV** theme (default dark board) |
| `premium.html` | **Premium TV** theme (`theme-premium` + `css/premium.css`) |
| `chart.html` | **Chart** theme (`theme-chart` + `css/chart.css`) |
| `admin.html` | Displays + station save |
| `js/app.js` | Board JSON load, focus pick, pin/walk, FOB, languages, theme footer |
| `js/admin.js` | Save via LOOKUP_BASE coach APIs |
| `js/i18n.js` | `window.COACH_I18N` |
| `config.js` | `API_BASE: ''`, `LOOKUP_BASE`, 15s refresh/lang |
| `css/style.css` | Shared layout + **frozen** walk-label rules |
| `css/premium.css` | Premium presentation only (must not override walk rotation) |
| `css/chart.css` | Light NTES-style coach chart |
| `img/coaches`, `img/chart` | Coach PNG / SVG assets |
| `img/amenities/` | Building sprites + transparent FOB art |

Theme detection: `body.theme-premium` / `body.theme-chart`, or `?theme=` query. Logic is shared; presentation CSS differs.

## URL contracts

| Product | Canonical URL |
|---------|---------------|
| PDS | `https://platform.zasya.online/` (station from server config) |
| Coach Current TV | `/?station=BG&display=entrance-main` |
| Coach Premium TV | `/premium.html?station=BG&display=entrance-main` |
| Coach Chart | `/chart.html?station=BG&display=entrance-main` |
| Admin | `/admin.html` |

Footer `theme-nav` links preserve `station` + `display` and hide the link for the page currently open.

## Rendering model (Coach)

1. Fetch `board.json` (+ displays.json / layout.json for overlay).
2. `pickLiveFocus` using wall clock vs `stationBoard` / `boardRakes`.
3. Assemble focus rake + you-are-here (`resolveClientPin`).
4. If train PF ≠ display PF and FOB links that PF → cross-platform deck (PF1 amenities, survey-anchored FOB, walk from PF1 pin).
5. Rotate language every `LANG_ROTATE_MS`.

## Walk labels (frozen)

Applies to Current TV, Premium, and Chart:

1. Labels only on the platform side of the yellow safety line.
2. Left of You-are-here: `rotate(-90deg)`.
3. Right of You-are-here: `rotate(90deg)`.
4. Stack: meters, then walk time.
5. Distances radiate from the pin.

Do not change unless product explicitly requests a redesign.

## Viewport behaviour (Coach)

- Uses `100dvh` / `data-vh` short/tiny modes — **not** OS sniffing.
- Short viewports shrink station table so pin/walk remain visible.
- Premium allocates more platform-row height so rotated walk glyphs stay below the yellow line.

## State management

Module-level variables in JS (no Redux/Vuex). `localStorage` for session ids and admin key (sessionStorage for Coach admin key).

## Accessibility / branding

- Indian Railways logo in header.
- Status and chrome strings localized; train names remain NTES English.
- Premium may show accessibility badge on toilets when layout marks Divyang adjacent facilities.
