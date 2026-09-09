# Station overlays (unsigned)

Use overlays for station-specific corrections without forking public `main` and without the licence control plane (paused until TTS/app testing is done).

## Layout

```text
/etc/zasya/railway/overlays/{STATION}/
  layout.json
  displays.json
  announcements.json
```

Repo files under `coach-position/data/stations/{STATION}/` load first. Overlay keys win. Missing overlay = current behaviour. Arrays in an overlay replace the repo array.

Copy with scp, for example:

```bash
sudo mkdir -p /etc/zasya/railway/overlays/BG
sudo cp overlays/BG/layout.json /etc/zasya/railway/overlays/BG/
```

Do not sign overlays in this cycle. BG survey data stays in git for testing.
