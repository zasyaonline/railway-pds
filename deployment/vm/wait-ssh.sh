#!/usr/bin/env bash
# Poll until SSH to zasya@VM is available (Ubuntu autoinstall + first boot).
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
# shellcheck source=lib.sh
source "$(cd "$(dirname "$0")" && pwd)/lib.sh"

ensure_ssh_key
TIMEOUT_SEC="${RAILWAY_SSH_TIMEOUT:-2400}"
SLEEP_SEC=10
STARTED_AT="$(date +%s)"

utm_ip() {
  command -v utmctl >/dev/null 2>&1 || return 1
  utmctl ip-address "$VM_NAME" 2>/dev/null | awk 'NF && $1 !~ /^fe80:/ {print $1; exit}'
}

scan_shared_net() {
  local i ip
  for i in $(seq 2 40); do
    ip="192.168.64.$i"
    if nc -z -G 1 "$ip" 22 2>/dev/null; then
      # shellcheck disable=SC2046
      if vm_ssh "$ip" 'true' 2>/dev/null; then
        echo "$ip"
        return 0
      fi
    fi
  done
  return 1
}

try_ip() {
  local ip="$1"
  [[ -n "$ip" ]] || return 1
  vm_ssh "$ip" 'true' 2>/dev/null
}

echo "==> Waiting up to ${TIMEOUT_SEC}s for SSH on $VM_NAME"
while true; do
  now="$(date +%s)"
  if (( now - STARTED_AT > TIMEOUT_SEC )); then
    fail_report "wait for SSH after autoinstall" \
      "$0" \
      "ssh ${SSH_USER}@<VM-IP> succeeds" \
      "timeout after ${TIMEOUT_SEC}s" \
      "" \
      "Provision cannot start until Ubuntu has finished autoinstall and SSH is up." \
      "$(gui_create_checklist)"$'\n'"Then rerun wait-ssh.sh. Password file: $PASSWORD_FILE"
  fi

  CANDIDATE="${VM_IP:-}"
  if [[ -z "$CANDIDATE" ]]; then
    CANDIDATE="$(utm_ip || true)"
  fi
  if [[ -z "$CANDIDATE" ]]; then
    CANDIDATE="$(scan_shared_net || true)"
  fi
  if [[ -n "$CANDIDATE" ]] && try_ip "$CANDIDATE"; then
    save_vm_ip "$CANDIDATE"
    echo "SSH ready: ${SSH_USER}@${CANDIDATE}"
    exit 0
  fi
  elapsed=$(( now - STARTED_AT ))
  if (( elapsed % 60 < SLEEP_SEC )); then
    echo "still waiting (${elapsed}s / ${TIMEOUT_SEC}s)..."
    if [[ -n "${CANDIDATE:-}" ]]; then
      echo "  last address tried: $CANDIDATE (port 22 may be the installer; zasya key is accepted after first boot)"
    fi
  fi
  sleep "$SLEEP_SEC"
done
