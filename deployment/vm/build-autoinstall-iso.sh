#!/usr/bin/env bash
# Build nocloud CIDATA ISO (and a remastered autoinstall Ubuntu ISO when xorriso exists).
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "$0")" && pwd)/lib.sh"

ensure_ssh_key
mkdir -p "$NOCLOUD_DIR"

password_hash() {
  local pw="$1" hashed=""
  hashed="$(openssl passwd -6 "$pw" 2>/dev/null || true)"
  if [[ -n "$hashed" ]]; then
    printf '%s\n' "$hashed"
    return
  fi
  python3 - "$pw" <<'PY'
import crypt, sys
print(crypt.crypt(sys.argv[1], crypt.mksalt(crypt.METHOD_SHA512)))
PY
}

if [[ ! -f "$PASSWORD_FILE" ]]; then
  LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 16 > "$PASSWORD_FILE"
  chmod 600 "$PASSWORD_FILE"
fi
PASSWORD="$(tr -d '\r\n' < "$PASSWORD_FILE")"
HASH="$(password_hash "$PASSWORD")"

AUTH_KEYS="$(collect_authorized_keys | python3 -c '
import sys, json
keys = [line.strip() for line in sys.stdin if line.strip()]
print(json.dumps(keys))
')"

python3 - "$NOCLOUD_DIR/user-data" "$HASH" "$AUTH_KEYS" <<'PY'
import json, sys
path, hashed, keys_json = sys.argv[1], sys.argv[2], sys.argv[3]
keys = json.loads(keys_json)
key_lines = "\n".join(f'      - {k}' for k in keys)
# cloud-config autoinstall for Ubuntu Server 24.04
text = f"""#cloud-config
autoinstall:
  version: 1
  locale: en_US.UTF-8
  keyboard:
    layout: us
  interactive-sections: []
  identity:
    hostname: railway-vm
    username: zasya
    password: "{hashed}"
  ssh:
    install-server: true
    allow-pw: true
    authorized-keys:
{key_lines}
  storage:
    layout:
      name: lvm
  packages:
    - openssh-server
  late-commands:
    - echo 'zasya ALL=(ALL) NOPASSWD:ALL' > /target/etc/sudoers.d/zasya
    - chmod 440 /target/etc/sudoers.d/zasya
    - curtin in-target --target=/target -- systemctl enable ssh
  user-data:
    disable_root: true
    ssh_pwauth: true
"""
open(path, "w").write(text)
PY

cat > "$NOCLOUD_DIR/meta-data" <<'EOF'
instance-id: railway-vm
local-hostname: railway-vm
EOF

touch "$NOCLOUD_DIR/vendor-data"

rm -f "$CIDATA_ISO"
hdiutil makehybrid -iso -joliet -default-volume-name cidata -o "$CIDATA_ISO" "$NOCLOUD_DIR" >/dev/null
echo "CIDATA ISO: $CIDATA_ISO"

ORIG="$CACHE_DIR/ubuntu-24.04.iso"
if [[ ! -f "$ORIG" ]]; then
  echo "Ubuntu ISO not downloaded yet; CIDATA only. Run download-iso.sh first to remaster." >&2
  exit 0
fi

patch_grub() {
  local file="$1"
  chmod u+w "$file" 2>/dev/null || true
  python3 - "$file" <<'PY'
import pathlib, sys
p = pathlib.Path(sys.argv[1])
text = p.read_text(errors="replace")
needle = "autoinstall ds=nocloud\\;s=/cdrom/nocloud/"
out = []
for line in text.splitlines(keepends=True):
    if line.strip().startswith("set timeout="):
        line = "set timeout=1\n"
    if "vmlinuz" in line and "autoinstall" not in line:
        if "---" in line:
            line = line.replace("---", needle + " ---", 1)
        else:
            line = line.rstrip("\n") + " " + needle + "\n"
    out.append(line)
p.write_text("".join(out))
if needle not in p.read_text(errors="replace"):
    raise SystemExit(f"autoinstall kernel args not written to {p}")
PY
}

remaster_with_xorriso() {
  command -v xorriso >/dev/null 2>&1 || return 1
  local work grub loopback
  work="$CACHE_DIR/iso-work"
  rm -rf "$work"
  mkdir -p "$work/nocloud" "$work/extract"
  cp -R "$NOCLOUD_DIR/." "$work/nocloud/"
  rm -f "$AUTOINSTALL_ISO"
  cp "$ORIG" "$AUTOINSTALL_ISO"
  xorriso -dev "$AUTOINSTALL_ISO" -boot_image any replay \
    -map "$work/nocloud" /nocloud \
    -chmod 0755 /nocloud -- >/tmp/zasya-xorriso-map.log 2>&1 || return 1
  grub="$work/extract/grub.cfg"
  loopback="$work/extract/loopback.cfg"
  mkdir -p "$work/extract"
  xorriso -osirrox on -indev "$AUTOINSTALL_ISO" -extract /boot/grub/grub.cfg "$grub" >/tmp/zasya-xorriso-extract.log 2>&1 || return 1
  chmod u+w "$grub"
  patch_grub "$grub" || return 1
  xorriso -dev "$AUTOINSTALL_ISO" -boot_image any replay -update "$grub" /boot/grub/grub.cfg >/tmp/zasya-xorriso-update.log 2>&1 || return 1
  if xorriso -osirrox on -indev "$AUTOINSTALL_ISO" -extract /boot/grub/loopback.cfg "$loopback" >/dev/null 2>&1; then
    chmod u+w "$loopback" 2>/dev/null || true
    patch_grub "$loopback" || return 1
    xorriso -dev "$AUTOINSTALL_ISO" -boot_image any replay -update "$loopback" /boot/grub/loopback.cfg >/dev/null 2>&1 || true
  fi
  echo "Autoinstall ISO: $AUTOINSTALL_ISO"
  return 0
}

if command -v xorriso >/dev/null 2>&1; then
  if remaster_with_xorriso; then
    echo "Remastered Ubuntu ISO with autoinstall kernel parameters."
  else
    echo "xorriso remaster failed. See /tmp/zasya-xorriso-*.log" >&2
    exit 1
  fi
else
  echo "xorriso not installed; CIDATA-only. Install with: brew install xorriso" >&2
  echo "The installer may wait for you to type yes." >&2
  ln -sfn "$ORIG" "$AUTOINSTALL_ISO"
fi
