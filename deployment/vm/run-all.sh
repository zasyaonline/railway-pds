#!/usr/bin/env bash
# Orchestrate Mac → UTM Ubuntu appliance install and validation.
# On failure, prints STEP/COMMAND/EXPECTED/ACTUAL/LOG/IMPACT/NEXT ACTION (BUILD §50).
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
# shellcheck source=lib.sh
source "$(cd "$(dirname "$0")" && pwd)/lib.sh"

HERE="$(cd "$(dirname "$0")" && pwd)"
SKIP_CREATE=0
for arg in "$@"; do
  case "$arg" in
    --skip-create) SKIP_CREATE=1 ;;
    --help|-h)
      echo "Usage: $0 [--skip-create]"
      echo "Automates download-iso → autoinstall ISO → UTM create → wait-ssh → provision → verify."
      exit 0
      ;;
  esac
done

run_step() {
  local step="$1"
  local command="$2"
  local expected="$3"
  shift 3
  echo ""
  echo "==== $step ===="
  local logfile rc
  logfile="$(mktemp "${TMPDIR:-/tmp}/zasya-railway-step.XXXXXX")"
  set +e
  "$@" 2>&1 | tee "$logfile"
  rc=${PIPESTATUS[0]}
  set -e
  if [[ $rc -ne 0 ]]; then
    fail_report "$step" "$command" "$expected" "exit $rc" "$(cat "$logfile")"
  fi
  rm -f "$logfile"
}

echo "Railway Local MVP — Ubuntu VM automator"
echo "Repo: $REPO_ROOT"
echo "Cache: $CACHE_DIR"

run_step "Mac unit tests (pre-VM gate)" \
  "npm test" \
  "npm test passes in this repository (count may exceed 24)" \
  bash -lc "cd '$REPO_ROOT' && npm test"

run_step "Download Ubuntu Server 24.04 ISO" \
  "$HERE/download-iso.sh" \
  "ISO matching $(host_arch) stored in $CACHE_DIR" \
  bash "$HERE/download-iso.sh"

run_step "Build autoinstall CIDATA ISO" \
  "$HERE/build-autoinstall-iso.sh" \
  "cidata.iso (and remastered Ubuntu ISO when xorriso is available)" \
  bash "$HERE/build-autoinstall-iso.sh"

if [[ "$SKIP_CREATE" == "1" ]]; then
  echo "==== Create UTM VM (skipped) ===="
  gui_create_checklist
else
  echo ""
  echo "==== Create UTM VM $VM_NAME ===="
  set +e
  CREATE_LOG="$(bash "$HERE/create-utm-vm.sh" 2>&1)"
  CREATE_RC=$?
  set -e
  printf '%s\n' "$CREATE_LOG"
  if [[ $CREATE_RC -ne 0 ]]; then
    echo ""
    gui_create_checklist
    echo ""
    echo "AppleScript/UTM create did not finish. Waiting for an operator-created VM to offer SSH..."
  fi
fi

run_step "Wait for SSH after autoinstall" \
  "$HERE/wait-ssh.sh" \
  "ssh ${SSH_USER}@<VM-IP> succeeds" \
  bash "$HERE/wait-ssh.sh"

run_step "Provision appliance (rsync, Mac-issued licence, railway-setup)" \
  "$HERE/provision.sh" \
  "packages.sh + npm test + railway-setup --non-interactive; private key absent on VM" \
  bash "$HERE/provision.sh"

run_step "Verify from Mac (curl + acceptance suite)" \
  "$HERE/verify-from-mac.sh" \
  "http://<VM-IP>/{platform,coach,admin,health} reachable; acceptance.sh all PASS" \
  bash "$HERE/verify-from-mac.sh"

echo ""
echo "INSTALLATION READY"
echo "VM IP: $(load_vm_ip)"
echo "Platform: http://$(load_vm_ip)/platform/"
echo "Coach:    http://$(load_vm_ip)/coach/"
echo "Admin:    http://$(load_vm_ip)/admin/"
echo "Health:   http://$(load_vm_ip)/health"
echo "SSH:      ssh -i $SSH_KEY ${SSH_USER}@$(load_vm_ip)"
