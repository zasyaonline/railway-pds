#!/usr/bin/env bash
# Shared helpers for Mac-side Ubuntu VM automation. Sourced, not executed.
# shellcheck disable=SC2034

VM_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$VM_LIB_DIR/../.." && pwd)"
CACHE_DIR="${RAILWAY_VM_CACHE:-$VM_LIB_DIR/.cache}"
VM_NAME="${RAILWAY_VM_NAME:-railway-vm}"
SSH_USER="${RAILWAY_VM_USER:-zasya}"
REMOTE_REPO="${RAILWAY_VM_REMOTE_REPO:-/home/${SSH_USER}/railway-pds}"
STATION_CODE="${RAILWAY_STATION_CODE:-BG}"
STATION_NAME="${RAILWAY_STATION_NAME:-Bhongir}"
GRACE_HOURS="${RAILWAY_GRACE_HOURS:-24}"
KIOSK_URL="${RAILWAY_KIOSK_URL:-http://127.0.0.1/platform/}"
NTES_ENDPOINT="${RAILWAY_NTES_ENDPOINT:-https://enquiry.indianrail.gov.in/crisns/AppServAnd}"
KEYS_DIR="${RAILWAY_KEYS_DIR:-}"
SSH_KEY="$CACHE_DIR/zasya-railway-vm"
PASSWORD_FILE="$CACHE_DIR/zasya-password"
CIDATA_ISO="$CACHE_DIR/cidata.iso"
AUTOINSTALL_ISO="$CACHE_DIR/ubuntu-24.04-autoinstall.iso"
NOCLOUD_DIR="$CACHE_DIR/nocloud"

mkdir -p "$CACHE_DIR"

if [[ -z "$KEYS_DIR" ]]; then
  if [[ -f "$REPO_ROOT/keys/licence-private.pem" ]]; then
    KEYS_DIR="$REPO_ROOT/keys"
  elif [[ -f "$REPO_ROOT/.zasya/keys/licence-private.pem" ]]; then
    KEYS_DIR="$REPO_ROOT/.zasya/keys"
  else
    KEYS_DIR="$REPO_ROOT/keys"
  fi
fi

fail_report() {
  local step="$1"
  local command="$2"
  local expected="$3"
  local actual="$4"
  local log="${5:-}"
  local impact="${6:-Installer path cannot be declared successful.}"
  local next="${7:-Fix the failing step and rerun. Do not workaround by hand and call the appliance valid.}"
  cat <<EOF
STEP:
${step}

COMMAND:
${command}

EXPECTED:
${expected}

ACTUAL:
${actual}

LOG:
${log}

IMPACT:
${impact}

NEXT ACTION:
${next}
EOF
  exit 1
}

host_arch() {
  local m
  m="$(uname -m)"
  case "$m" in
    arm64|aarch64) echo arm64 ;;
    x86_64|amd64) echo amd64 ;;
    *) echo "$m" ;;
  esac
}

utm_arch() {
  case "$(host_arch)" in
    arm64) echo aarch64 ;;
    *) echo x86_64 ;;
  esac
}

ensure_ssh_key() {
  mkdir -p "$CACHE_DIR"
  if [[ ! -f "$SSH_KEY" ]]; then
    ssh-keygen -t ed25519 -N '' -f "$SSH_KEY" -C "zasya-railway-vm" >/dev/null
  fi
}

collect_authorized_keys() {
  ensure_ssh_key
  local keys=()
  keys+=("$(cat "${SSH_KEY}.pub")")
  local f
  for f in "$HOME/.ssh/id_ed25519.pub" "$HOME/.ssh/id_rsa.pub" "$HOME/.ssh/id_ecdsa.pub"; do
    if [[ -f "$f" ]]; then
      keys+=("$(cat "$f")")
    fi
  done
  printf '%s\n' "${keys[@]}" | awk 'NF && !seen[$0]++'
}

init_ssh_opts() {
  ensure_ssh_key
  SSH_OPTS=(
    -o BatchMode=yes
    -o StrictHostKeyChecking=no
    -o UserKnownHostsFile=/dev/null
    -o IdentitiesOnly=yes
    -i "$SSH_KEY"
    -o ConnectTimeout=5
  )
}

vm_ssh() {
  local ip="$1"
  shift
  init_ssh_opts
  ssh "${SSH_OPTS[@]}" "${SSH_USER}@${ip}" "$@"
}

vm_scp() {
  init_ssh_opts
  scp "${SSH_OPTS[@]}" "$@"
}

vm_rsync_shell() {
  init_ssh_opts
  local cmd="ssh"
  local opt
  for opt in "${SSH_OPTS[@]}"; do
    cmd+=" $(printf '%q' "$opt")"
  done
  printf '%s' "$cmd"
}

vm_ip_file() {
  echo "$CACHE_DIR/vm-ip"
}

save_vm_ip() {
  printf '%s\n' "$1" > "$(vm_ip_file)"
}

load_vm_ip() {
  if [[ -n "${VM_IP:-}" ]]; then
    echo "$VM_IP"
    return
  fi
  if [[ -f "$(vm_ip_file)" ]]; then
    tr -d '[:space:]' < "$(vm_ip_file)"
  fi
}

gui_create_checklist() {
  cat <<EOF
UTM GUI create checklist (AppleScript create failed or was skipped)
  1. Open UTM → Create a New Virtual Machine → Virtualize (not Emulate)
  2. Linux, ISO = Ubuntu Server 24.04 matching this Mac ($(host_arch))
  3. CPU 4, RAM 6 GB, Disk 40 GB, Network Shared/NAT
  4. Attach the CIDATA ISO as a second CD/DVD: $CIDATA_ISO
  5. Name the VM: $VM_NAME
  6. Start the VM and finish Ubuntu autoinstall (type "yes" if the installer waits)
  7. After first boot, rerun wait-ssh / run-all from this step
EOF
}
