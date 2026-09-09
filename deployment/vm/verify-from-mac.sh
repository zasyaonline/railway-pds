#!/usr/bin/env bash
# Curl the four LAN URLs from the Mac and run the appliance acceptance suite over SSH.
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
# shellcheck source=lib.sh
source "$(cd "$(dirname "$0")" && pwd)/lib.sh"

ensure_ssh_key
IP="$(load_vm_ip)"
if [[ -z "$IP" ]]; then
  fail_report "verify from Mac" \
    "$0" \
    "VM_IP or $CACHE_DIR/vm-ip" \
    "no IP saved" \
    "" \
    "Browser/curl checks cannot run." \
    "Run wait-ssh.sh first."
fi

check() {
  local url="$1"
  local name="$2"
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$url" || echo curl-failed)"
  if [[ "$code" != "200" && "$code" != "301" && "$code" != "302" ]]; then
    fail_report "Mac curl $name" \
      "curl -I $url" \
      "HTTP 200 from nginx on the VM" \
      "HTTP $code" \
      "" \
      "The Mac (standing in for a station LAN TV/browser) cannot reach $name." \
      "Check nginx, UFW, and that Node is bound to 127.0.0.1 only."
  fi
  echo "PASS mac-curl $name ($url -> $code)"
}

check "http://${IP}/platform/" platform
check "http://${IP}/coach/" coach
check "http://${IP}/admin/" admin
check "http://${IP}/health" health

HEALTH="$(curl -fsS --max-time 10 "http://${IP}/health" || true)"
LICENCE="$(printf '%s' "$HEALTH" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("licence",""))' 2>/dev/null || true)"
if [[ "$LICENCE" != "valid" && "$LICENCE" != "expiring" ]]; then
  fail_report "licence via nginx health" \
    "curl http://${IP}/health" \
    "licence valid (or expiring)" \
    "${HEALTH}" \
    "" \
    "The appliance is not licence-valid on the LAN health URL." \
    "Re-issue the Mac-side licence and rerun provision.sh."
fi

echo "==> SSH acceptance suite"
ACCEPT_LOG="$(vm_ssh "$IP" 'sudo railway-acceptance all || sudo bash /opt/zasya/railway/deployment/scripts/acceptance.sh all' 2>&1)" || {
  fail_report "SSH acceptance.sh all" \
    "ssh ${SSH_USER}@${IP} sudo railway-acceptance all" \
    "every acceptance check PASS" \
    "$ACCEPT_LOG" \
    "$ACCEPT_LOG" \
    "The installer path is not yet proven." \
    "Use the failing PASS/FAIL line as the next debug step. Do not workaround by hand."
}
printf '%s\n' "$ACCEPT_LOG"
echo "PASS verify-from-mac"
