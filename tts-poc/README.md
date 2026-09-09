# Isolated offline TTS POC

This directory is **not** part of Platform, Coach, NTES, Admin, or kiosk. Do not import it from the appliance apps.

Conceptual API (implemented by `scripts/synthesize.js`):

```text
synthesize(text, language, voice) -> WAV
```

Target host: **Ubuntu 24.04 ARM64** (UTM appliance). macOS can only smoke-test eSpeak if installed; do not treat Mac WAVs as the POC result.

## Languages

English, Hindi, Telugu. Corpus is test wording, not Railway-approved copy.

## Run on Ubuntu

```bash
cd tts-poc
chmod +x scripts/install-ubuntu.sh scripts/play.sh
bash scripts/install-ubuntu.sh
# optional: export PIPER_BIN=$(cat piper-bin/piper.path)
node scripts/run-all.js
bash scripts/play.sh output
```

Piper voice binaries stay in `models/` (gitignored). Telugu often has **no** official Piper voice; the run records FAIL for those rows instead of inventing a model.

## Decision gate

After playback, fill listener scores in `results/results.md` (GOOD / ACCEPTABLE / POOR / FAIL):

- **A** Piper for all three languages
- **B** eSpeak NG
- **C** neither / hybrid (typical if Piper has no Telugu)

Generation success alone is not enough. Railway numbers and names must be intelligible.

## Reused data (copied, not required at runtime)

- `corpus/stations.json` — BG / SC / BZA names
- `corpus/named-trains.json` — 12723 Satavahana Express
