#!/usr/bin/env bash
# Create (or reuse) the railway-vm UTM guest. Virtualize, 4 CPU / 6 GB / 40 GB, Shared/NAT.
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
# shellcheck source=lib.sh
source "$(cd "$(dirname "$0")" && pwd)/lib.sh"

find_utm_bundle() {
  local d
  for d in \
    "$HOME/Library/Containers/com.utmapp.UTM/Data/Documents/${VM_NAME}.utm" \
    "$HOME/Library/Application Support/UTM/${VM_NAME}.utm"; do
    if [[ -f "$d/config.plist" ]]; then
      printf '%s\n' "$d"
      return 0
    fi
  done
  return 1
}

# UTM QEMU defaults to serial-only (blank window) and CD ImageName often omitted.
patch_utm_bundle() {
  local bundle iso_boot iso_cidata
  bundle="$(find_utm_bundle || true)"
  [[ -n "$bundle" ]] || return 0
  iso_boot="$1"
  iso_cidata="$2"
  python3 - "$bundle" "$iso_boot" "$iso_cidata" <<'PY'
import pathlib, plistlib, shutil, sys
bundle = pathlib.Path(sys.argv[1])
boot = pathlib.Path(sys.argv[2])
cidata = pathlib.Path(sys.argv[3])
plist_path = bundle / "config.plist"
data = bundle / "Data"
cfg = plistlib.loads(plist_path.read_bytes())
if not cfg.get("Display"):
    cfg["Display"] = [{"Hardware": "virtio-ramfb", "WidthPixels": 1920, "HeightPixels": 1080}]
cds = [d for d in cfg.get("Drive", []) if d.get("ImageType") == "CD" or d.get("Interface") == "USB"]
# fallback: first two drives if ImageType missing
if len(cds) < 2:
    cds = [d for d in cfg.get("Drive", []) if not d.get("ImageName", "").endswith(".qcow2") and not d.get("ImageName", "").endswith(".img")][:2]
sources = [boot, cidata]
for drive, src in zip(cds, sources):
    ident = drive.get("Identifier") or src.stem
    dest = data / f"{ident}.iso"
    if src.exists():
        if not dest.exists() or dest.stat().st_size != src.stat().st_size:
            shutil.copy2(src, dest)
        drive["ImageName"] = dest.name
        drive["ImageType"] = "CD"
        drive["ReadOnly"] = True
plist_path.write_bytes(plistlib.dumps(cfg, fmt=plistlib.FMT_XML))
print(f"Patched display + CD images in {bundle}")
PY
}

FIX_DISPLAY=0
RECREATE=0
for arg in "$@"; do
  case "$arg" in
    --recreate) RECREATE=1 ;;
    --fix-display) FIX_DISPLAY=1 ;;
  esac
done

CPU="${RAILWAY_VM_CPU:-4}"
MEM="${RAILWAY_VM_MEM_MIB:-6144}"
DISK="${RAILWAY_VM_DISK_MIB:-40960}"

BOOT_ISO="$AUTOINSTALL_ISO"
if [[ ! -f "$BOOT_ISO" ]]; then
  BOOT_ISO="$CACHE_DIR/ubuntu-24.04.iso"
fi
if [[ ! -f "$BOOT_ISO" || ! -f "$CIDATA_ISO" ]]; then
  fail_report "create UTM VM" \
    "$0" \
    "Ubuntu ISO and CIDATA ISO in $CACHE_DIR" \
    "missing $BOOT_ISO and/or $CIDATA_ISO" \
    "" \
    "The VM cannot be created until the installer media exists." \
    "Run download-iso.sh and build-autoinstall-iso.sh first."
fi

# UTM (sandboxed) cannot read the git checkout. Stage media inside its container.
stage_iso_for_utm() {
  local src="$1" name="$2"
  local dest_dirs=()
  dest_dirs+=(
    "$HOME/Library/Containers/com.utmapp.UTM/Data/Documents/zasya-railway-media"
    "$HOME/Library/Application Support/UTM/zasya-railway-media"
  )
  local dir dest
  for dir in "${dest_dirs[@]}"; do
    mkdir -p "$dir" 2>/dev/null || continue
    dest="$dir/$name"
    if [[ -f "$dest" ]] && [[ "$(stat -f %z "$dest" 2>/dev/null || echo 0)" == "$(stat -f %z "$src")" ]]; then
      # Reject APFS clones of files outside the sandbox; UTM cannot open them.
      if ! cmp -s "$src" "$dest" 2>/dev/null; then
        rm -f "$dest"
      else
        printf '%s\n' "$dest"
        return 0
      fi
    fi
    rm -f "$dest"
    echo "Copying $name into UTM-readable storage (full copy, not clonefile)..." >&2
    if ditto "$src" "$dest" 2>/dev/null; then
      printf '%s\n' "$dest"
      return 0
    fi
  done
  python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$src"
}

BOOT_ISO="$(stage_iso_for_utm "$BOOT_ISO" "ubuntu-24.04-autoinstall.iso")"
CIDATA_REAL="$(stage_iso_for_utm "$CIDATA_ISO" "cidata.iso")"
echo "Boot ISO: $BOOT_ISO"
echo "CIDATA:   $CIDATA_REAL"

vm_exists() {
  if command -v utmctl >/dev/null 2>&1; then
    utmctl list 2>/dev/null | grep -Fq "$VM_NAME"
    return
  fi
  osascript -e "tell application \"UTM\" to get name of virtual machines" 2>/dev/null | grep -Fq "$VM_NAME"
}

delete_vm() {
  osascript -e "tell application \"UTM\" to delete virtual machine named \"${VM_NAME}\"" 2>/dev/null || true
}

start_vm() {
  local err=""
  if command -v utmctl >/dev/null 2>&1; then
    err="$(utmctl start "$VM_NAME" 2>&1)" || true
    if [[ -n "$err" ]]; then
      echo "$err" >&2
    fi
  else
    osascript -e "tell application \"UTM\" to start virtual machine named \"${VM_NAME}\"" >/dev/null
  fi
  sleep 2
  if command -v utmctl >/dev/null 2>&1 && utmctl status "$VM_NAME" 2>/dev/null | grep -qiE 'stopped|paused'; then
    open -a UTM
    sleep 1
    osascript -e "tell application \"UTM\" to start virtual machine named \"${VM_NAME}\"" 2>/dev/null || true
  fi
}

if vm_exists && [[ "$RECREATE" == "1" ]]; then
  echo "Deleting existing $VM_NAME"
  if command -v utmctl >/dev/null 2>&1; then
    utmctl stop "$VM_NAME" >/dev/null 2>&1 || true
    sleep 2
  fi
  delete_vm
  sleep 1
fi

if vm_exists; then
  echo "UTM VM $VM_NAME already exists — stopping to attach a display (blank window is serial-only)"
  if command -v utmctl >/dev/null 2>&1; then
    utmctl stop "$VM_NAME" >/dev/null 2>&1 || true
    sleep 2
  fi
  patch_utm_bundle "$BOOT_ISO" "$CIDATA_REAL"
  start_vm
  echo "Status: $(utmctl status "$VM_NAME" 2>/dev/null || echo unknown)"
  echo "If the UTM window is still grey, click the serial/terminal control or run: utmctl attach $VM_NAME"
  exit 0
fi

open -a UTM
sleep 2

if ! result="$(osascript "$(cd "$(dirname "$0")" && pwd)/create-utm-vm.applescript" \
    "$VM_NAME" "$BOOT_ISO" "$CIDATA_REAL" "$CPU" "$MEM" "$DISK" "$(utm_arch)")"; then
  echo "AppleScript UTM create failed." >&2
  gui_create_checklist >&2
  exit 2
fi
echo "$result"
# Created VMs start stopped; attach a virtio display and copy ISOs into the bundle.
patch_utm_bundle "$BOOT_ISO" "$CIDATA_REAL"

start_vm
if command -v utmctl >/dev/null 2>&1; then
  echo "Status: $(utmctl status "$VM_NAME" 2>/dev/null || echo unknown)"
fi
echo "Started $VM_NAME"
