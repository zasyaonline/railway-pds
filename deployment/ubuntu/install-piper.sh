#!/usr/bin/env bash
# Install Piper TTS binary + EN/HI/TE voices for the appliance.
# Safe to rerun. Models stay under /var/lib/zasya/railway/tts/models (not git).
set -euo pipefail

PIPER_TAG="${PIPER_TAG:-2023.11.14-2}"
PIPER_ROOT="${PIPER_ROOT:-/opt/zasya/piper}"
MODELS="${ZASYA_PIPER_MODELS:-/var/lib/zasya/railway/tts/models}"
HF="https://huggingface.co/rhasspy/piper-voices/resolve/main"
ARCH="$(uname -m)"

if [[ "$(id -u)" -ne 0 ]]; then
  exec sudo -E bash "$0" "$@"
fi

mkdir -p "$PIPER_ROOT" "$MODELS"

case "$ARCH" in
  aarch64|arm64) PIPER_ASSET="piper_linux_aarch64.tar.gz" ;;
  x86_64|amd64) PIPER_ASSET="piper_linux_x86_64.tar.gz" ;;
  *)
    echo "WARN: no Piper binary for $ARCH" >&2
    exit 0
    ;;
esac

TMP="$(mktemp -d)"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

echo "==> Piper $PIPER_TAG $PIPER_ASSET"
if [[ ! -x "$PIPER_ROOT/piper" ]]; then
  curl -fsSL -o "$TMP/$PIPER_ASSET" \
    "https://github.com/rhasspy/piper/releases/download/${PIPER_TAG}/${PIPER_ASSET}"
  tar -xzf "$TMP/$PIPER_ASSET" -C "$TMP"
  SRC="$(find "$TMP" -type f -name piper | head -1)"
  if [[ -z "$SRC" ]]; then
    echo "WARN: piper binary missing from archive" >&2
    exit 0
  fi
  cp -a "$(dirname "$SRC")/." "$PIPER_ROOT/"
  chmod 0755 "$PIPER_ROOT/piper"
fi

download_voice() {
  local dest="$1"
  local url="$2"
  if [[ -f "$dest" && -s "$dest" ]]; then
    echo "have $dest"
    return 0
  fi
  echo "==> $dest"
  if curl -fL --retry 3 -o "$dest" "$url"; then
    curl -fL --retry 3 -o "${dest}.json" "${url}.json" || true
  else
    echo "WARN: could not download $url" >&2
    rm -f "$dest"
    return 1
  fi
}

download_voice "$MODELS/en_US-lessac-medium.onnx" \
  "$HF/en/en_US/lessac/medium/en_US-lessac-medium.onnx" || true
download_voice "$MODELS/hi_IN-pratham-medium.onnx" \
  "$HF/hi/hi_IN/pratham/medium/hi_IN-pratham-medium.onnx" || true
download_voice "$MODELS/te_IN-venkatesh-medium.onnx" \
  "$HF/te/te_IN/venkatesh/medium/te_IN-venkatesh-medium.onnx" || true

chown -R root:zasya "$PIPER_ROOT" "$MODELS"
chmod 0755 "$PIPER_ROOT" "$MODELS"
chmod 0755 "$PIPER_ROOT/piper" 2>/dev/null || true
chmod 0644 "$MODELS"/* 2>/dev/null || true

if [[ -x "$PIPER_ROOT/piper" ]]; then
  echo "PIPER_BIN=$PIPER_ROOT/piper"
  "$PIPER_ROOT/piper" --help 2>&1 | head -20 || true
fi
ls -lh "$MODELS" || true
