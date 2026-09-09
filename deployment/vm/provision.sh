#!/usr/bin/env bash
# Copy the repo to the VM, issue a licence on the Mac, and run railway-setup.
# Never copies licence-private.pem. Does not use npm start.
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
# shellcheck source=lib.sh
source "$(cd "$(dirname "$0")" && pwd)/lib.sh"

ensure_ssh_key
IP="$(load_vm_ip)"
if [[ -z "$IP" ]]; then
  fail_report "provision VM" \
    "$0" \
    "VM_IP or $CACHE_DIR/vm-ip" \
    "no IP saved" \
    "" \
    "Cannot rsync or SSH without an address." \
    "Run wait-ssh.sh first."
fi

ssh_base() {
  vm_ssh "$IP" "$@"
}

echo "==> Rsync repo to ${SSH_USER}@${IP}:${REMOTE_REPO}"
ssh_base "mkdir -p '${REMOTE_REPO}'"
rsync -az --delete \
  --exclude node_modules \
  --exclude .git \
  --exclude dist \
  --exclude .zasya \
  --exclude deployment/vm/.cache \
  --exclude keys/licence-private.pem \
  --exclude '**/licence-private.pem' \
  -e "$(vm_rsync_shell)" \
  "$REPO_ROOT/" "${SSH_USER}@${IP}:${REMOTE_REPO}/"

if ssh_base "test -e '${REMOTE_REPO}/keys/licence-private.pem' -o -e '${REMOTE_REPO}/.zasya/keys/licence-private.pem'"; then
  fail_report "provision rsync" \
    "rsync $REPO_ROOT -> ${REMOTE_REPO}" \
    "licence-private.pem absent on VM" \
    "private key was copied" \
    "" \
    "The signing key must stay on the Mac." \
    "Remove the key from the VM and fix rsync excludes."
fi

echo "==> Issue licence on the Mac (private key stays here)"
mkdir -p "$KEYS_DIR"
if [[ ! -f "$KEYS_DIR/licence-private.pem" ]]; then
  node "$REPO_ROOT/deployment/scripts/licence-issue.js" --gen-keys --out-dir "$KEYS_DIR"
fi
if [[ ! -f "$KEYS_DIR/licence-public.pem" ]]; then
  fail_report "issue licence keys" \
    "node licence-issue.js --gen-keys --out-dir $KEYS_DIR" \
    "licence-public.pem" \
    "public key missing" \
    ""
fi
VALID_FROM="$(date -u +%Y-%m-%d)"
if date -u -v+1y +%Y-%m-%d >/dev/null 2>&1; then
  VALID_UNTIL="$(date -u -v+1y +%Y-%m-%d)"
else
  VALID_UNTIL="$(date -u -d '+1 year' +%Y-%m-%d)"
fi
node "$REPO_ROOT/deployment/scripts/licence-issue.js" \
  --station "$STATION_CODE" \
  --products platform,coach \
  --valid-from "$VALID_FROM" \
  --valid-until "$VALID_UNTIL" \
  --key "$KEYS_DIR/licence-private.pem" \
  --out "$CACHE_DIR/licence.json"

if [[ ! -f "$CACHE_DIR/admin-password" ]]; then
  LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 20 > "$CACHE_DIR/admin-password"
  chmod 600 "$CACHE_DIR/admin-password"
fi

ssh_base "mkdir -p /tmp/zasya-licence && chmod 700 /tmp/zasya-licence"
vm_scp \
  "$CACHE_DIR/licence.json" \
  "$KEYS_DIR/licence-public.pem" \
  "$CACHE_DIR/admin-password" \
  "${SSH_USER}@${IP}:/tmp/zasya-licence/"
ssh_base "chmod 600 /tmp/zasya-licence/admin-password /tmp/zasya-licence/licence.json"

echo "==> packages.sh (installs Node 22; required before npm test on a clean Ubuntu)"
ssh_base "sudo bash '${REMOTE_REPO}/deployment/ubuntu/packages.sh'"

echo "==> npm test on the VM"
ssh_base "cd '${REMOTE_REPO}' && npm install --silent && npm test"

echo "==> railway-setup --non-interactive"
ssh_base "sudo bash '${REMOTE_REPO}/deployment/scripts/railway-setup' --non-interactive \
  --station-code '${STATION_CODE}' \
  --station-name '${STATION_NAME}' \
  --licence /tmp/zasya-licence/licence.json \
  --licence-public-key /tmp/zasya-licence/licence-public.pem \
  --admin-password-file /tmp/zasya-licence/admin-password \
  --grace-hours '${GRACE_HOURS}' \
  --kiosk-url '${KIOSK_URL}' \
  --ntes-endpoint '${NTES_ENDPOINT}' \
  --source '${REMOTE_REPO}'"

ssh_base "shred -u /tmp/zasya-licence/admin-password 2>/dev/null || rm -f /tmp/zasya-licence/admin-password"
ssh_base "sudo test ! -e /etc/zasya/railway/licence-private.pem"
ssh_base "sudo test ! -e /opt/zasya/railway/keys/licence-private.pem"

echo "Provision complete. Admin password is in $CACHE_DIR/admin-password (Mac only)."
echo "VM password for ${SSH_USER} is in $PASSWORD_FILE"
