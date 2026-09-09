#!/usr/bin/env bash
# Play generated WAVs if an audio device exists. Safe to skip on headless VMs.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIR="${1:-$ROOT/output}"

play_one() {
  local f="$1"
  if command -v aplay >/dev/null 2>&1; then
    aplay -q "$f" || true
  elif command -v paplay >/dev/null 2>&1; then
    paplay "$f" || true
  elif command -v afplay >/dev/null 2>&1; then
    afplay "$f" || true
  else
    echo "No player (aplay/paplay/afplay). Keep $f for later PA testing."
    return 1
  fi
}

shopt -s globstar nullglob
files=("$DIR"/**/*.wav)
if [[ ${#files[@]} -eq 0 ]]; then
  echo "No WAV files under $DIR"
  exit 1
fi
for f in "${files[@]}"; do
  echo "PLAY $f"
  play_one "$f" || true
done
