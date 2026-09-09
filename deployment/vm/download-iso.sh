#!/usr/bin/env bash
# Download Ubuntu Server 24.04 LTS ISO matching this Mac's architecture.
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "$0")" && pwd)/lib.sh"

ARCH="$(host_arch)"
mkdir -p "$CACHE_DIR"

release_dir() {
  if [[ "$ARCH" == "arm64" ]]; then
    echo "https://cdimage.ubuntu.com/releases/24.04/release"
  else
    echo "https://releases.ubuntu.com/24.04"
  fi
}

resolve_iso_url() {
  local base sums name
  base="$(release_dir)"
  echo "==> Fetching SHA256SUMS from ${base}" >&2
  sums="$(command curl -fsSL "${base}/SHA256SUMS")"
  name="$(printf '%s\n' "$sums" | awk '/live-server-'"$ARCH"'\.iso$/ {gsub(/^\*/,"",$2); print $2}' | tail -1)"
  if [[ -z "$name" ]]; then
    fail_report "download Ubuntu 24.04 ISO" \
      "curl ${base}/SHA256SUMS" \
      "a live-server-${ARCH}.iso entry" \
      "no matching ISO name in SHA256SUMS" \
      "$sums"
  fi
  echo "${base}/${name}"
  echo "$name" > "$CACHE_DIR/ubuntu-iso-name"
  printf '%s\n' "$sums" | awk -v n="$name" '{f=$2; sub(/^\*/,"",f); if (f==n) print $1}' | head -1 > "$CACHE_DIR/ubuntu-iso.sha256"
}

# curl --retry can surface as `retry: command not found` on some macOS/bash
# combinations when combined with -C -. Keep the invocation simple.
download_iso() {
  local url="$1"
  local dest="$2"
  local partial="${dest}.partial"
  echo "Downloading to ${partial} (multi-gigabyte; can take several minutes)."
  if [[ -f "$partial" ]]; then
    command curl -fL --progress-bar -C - -o "$partial" "$url"
  else
    command curl -fL --progress-bar -o "$partial" "$url"
  fi
  mv "$partial" "$dest"
}

URL="$(resolve_iso_url)"
NAME="$(tr -d '[:space:]' < "$CACHE_DIR/ubuntu-iso-name")"
DEST="$CACHE_DIR/$NAME"

echo "==> Ubuntu Server 24.04 ($ARCH): $URL"
if [[ -f "$DEST" ]]; then
  echo "Already present: $DEST"
else
  download_iso "$URL" "$DEST"
fi

if [[ -s "$CACHE_DIR/ubuntu-iso.sha256" ]]; then
  expected="$(tr -d '[:space:]' < "$CACHE_DIR/ubuntu-iso.sha256")"
  echo "==> Verifying SHA256 (this reads the whole ISO)..."
  actual="$(shasum -a 256 "$DEST" | awk '{print $1}')"
  if [[ -n "$expected" && "$expected" != "$actual" ]]; then
    fail_report "verify Ubuntu ISO checksum" \
      "shasum -a 256 $DEST" \
      "$expected" \
      "$actual" \
      "" \
      "The downloaded ISO cannot be used for the appliance VM." \
      "Delete $DEST and rerun download-iso.sh"
  fi
  echo "SHA256 OK"
fi

ln -sfn "$DEST" "$CACHE_DIR/ubuntu-24.04.iso"
echo "ISO: $DEST"
