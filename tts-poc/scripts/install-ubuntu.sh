#!/usr/bin/env bash
# Install eSpeak NG and (optionally) Piper + voices on Ubuntu 24.04 ARM64.
# Models stay under tts-poc/models and must not be committed.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODELS="$ROOT/models"
BIN_DIR="$ROOT/piper-bin"
ARCH="$(uname -m)"

mkdir -p "$MODELS" "$BIN_DIR" "$ROOT/output/piper/en" "$ROOT/output/piper/hi" "$ROOT/output/piper/te"
mkdir -p "$ROOT/output/espeak/en" "$ROOT/output/espeak/hi" "$ROOT/output/espeak/te" "$ROOT/results"

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "This installer targets Ubuntu 24.04 ARM64. On macOS, install espeak-ng yourself for smoke tests only." >&2
fi

if command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y --no-install-recommends espeak-ng alsa-utils curl ca-certificates tar
fi

if ! command -v espeak-ng >/dev/null 2>&1; then
  echo "WARN: espeak-ng not on PATH" >&2
else
  echo "==> eSpeak NG $(espeak-ng --version 2>/dev/null | head -1)"
  espeak-ng --voices=en | head -3 || true
  espeak-ng --voices=hi | head -3 || true
  espeak-ng --voices=te | head -3 || true
fi

PIPER_TAG="${PIPER_TAG:-2023.11.14-2}"
case "$ARCH" in
  aarch64|arm64) PIPER_ASSET="piper_linux_aarch64.tar.gz" ;;
  x86_64|amd64) PIPER_ASSET="piper_linux_x86_64.tar.gz" ;;
  *)
    echo "WARN: no Piper binary mapped for $ARCH" >&2
    PIPER_ASSET=""
    ;;
esac

if [[ -n "$PIPER_ASSET" ]]; then
  echo "==> Piper $PIPER_TAG $PIPER_ASSET"
  curl -fsSL -o "$BIN_DIR/$PIPER_ASSET" \
    "https://github.com/rhasspy/piper/releases/download/${PIPER_TAG}/${PIPER_ASSET}" \
    || echo "WARN: Piper download failed (offline?). Skip Piper until the archive is copied to $BIN_DIR" >&2
  if [[ -f "$BIN_DIR/$PIPER_ASSET" ]]; then
    tar -xzf "$BIN_DIR/$PIPER_ASSET" -C "$BIN_DIR"
    PIPER_BIN="$(find "$BIN_DIR" -type f -name piper | head -1)"
    if [[ -n "$PIPER_BIN" ]]; then
      echo "PIPER_BIN=$PIPER_BIN"
      printf '%s\n' "$PIPER_BIN" > "$BIN_DIR/piper.path"
    fi
  fi
fi

download_voice() {
  local dest="$1"
  local url="$2"
  if [[ -f "$dest" ]]; then
    echo "have $dest"
    return 0
  fi
  echo "==> voice $dest"
  if curl -fsSL -o "$dest" "$url"; then
    curl -fsSL -o "${dest}.json" "${url}.json" || true
  else
    echo "WARN: could not download $url" >&2
    rm -f "$dest"
    return 1
  fi
}

HF="https://huggingface.co/rhasspy/piper-voices/resolve/main"
download_voice "$MODELS/en_US-lessac-medium.onnx" \
  "$HF/en/en_US/lessac/medium/en_US-lessac-medium.onnx" || true
download_voice "$MODELS/hi_IN-pratham-medium.onnx" \
  "$HF/hi/hi_IN/pratham/medium/hi_IN-pratham-medium.onnx" || true
# Official Piper Telugu is often absent; record the miss instead of inventing a model.
if [[ ! -f "$MODELS/te_IN.onnx" ]]; then
  echo "NOTE: No bundled Piper Telugu voice. Telugu Piper rows will FAIL until a model is placed at $MODELS/te_IN.onnx" >&2
fi

echo "Install complete. Run: node $ROOT/scripts/run-all.js"
