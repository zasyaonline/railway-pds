#!/bin/bash
# Set IST (Asia/Kolkata, UTC+5:30) and force NTP via chrony.
# UTM/QEMU guests freeze while the host sleeps; after resume the offset can be
# hours. `makestep 1.0 3` only steps the first three NTP updates, so later
# pauses leave the clock wrong while Leap status still says Normal.
# Safe to rerun. Exit 1 when TIME_SYNC_REQUIRED=1 (install/acceptance).
set -euo pipefail

TZ_NAME="Asia/Kolkata"
MAX_OFFSET_SEC="${ZASYA_MAX_CLOCK_OFFSET_SEC:-2}"
WAIT_SEC="${ZASYA_TIME_SYNC_WAIT_SEC:-60}"
REQUIRED="${TIME_SYNC_REQUIRED:-0}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo bash $0" >&2
  exit 1
fi

if ! command -v timedatectl >/dev/null 2>&1; then
  echo "WARN: timedatectl missing; skip timezone/NTP" >&2
  [[ "$REQUIRED" == "1" ]] && exit 1
  exit 0
fi

echo "==> Timezone ${TZ_NAME} (UTC+5:30)"
timedatectl set-timezone "$TZ_NAME"
timedatectl set-local-rtc 0 2>/dev/null || true

# Avoid two NTP clients fighting. Do not use timedatectl set-ntp (it can
# re-enable systemd-timesyncd and leave NTPSynchronized=no while chrony is fine).
systemctl disable --now systemd-timesyncd 2>/dev/null || true

if ! command -v chronyd >/dev/null 2>&1 && ! command -v chrony >/dev/null 2>&1; then
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends chrony
fi

mkdir -p /etc/chrony/conf.d
cat > /etc/chrony/conf.d/zasya-india.conf <<'EOF'
# Indian Railways appliance — Indian NTP pool.
# Step any offset forever: kiosk VMs pause/resume with multi-hour drift.
server 0.in.pool.ntp.org iburst
server 1.in.pool.ntp.org iburst
server 2.in.pool.ntp.org iburst
server 3.in.pool.ntp.org iburst
makestep 1.0 -1
rtcsync
EOF
chmod 0644 /etc/chrony/conf.d/zasya-india.conf

systemctl enable chrony 2>/dev/null || systemctl enable chronyd 2>/dev/null || true
systemctl restart chrony 2>/dev/null || systemctl restart chronyd 2>/dev/null || true

sync_rtc() {
  if command -v hwclock >/dev/null 2>&1; then
    hwclock --systohc --utc 2>/dev/null || hwclock -w 2>/dev/null || true
  elif [[ -x /usr/sbin/hwclock ]]; then
    /usr/sbin/hwclock --systohc --utc 2>/dev/null || true
  fi
}

clock_ok() {
  local tracking offset
  tracking="$(chronyc tracking 2>/dev/null || true)"
  [[ -n "$tracking" ]] || return 1
  echo "$tracking" | grep -qiE 'Leap status[[:space:]]*:[[:space:]]*Normal' || return 1
  offset="$(echo "$tracking" | awk -F: '/System time/ { gsub(/^[ \t]+/, "", $2); print $2; exit }')"
  [[ -n "$offset" ]] || return 1
  # e.g. "0.000123456 seconds slow of NTP time"
  echo "$offset" | awk -v max="$MAX_OFFSET_SEC" '
    {
      n = $1 + 0
      if (n == 0 && $1 !~ /^[0-9]/) exit 1
      if (n > max) exit 1
      exit 0
    }'
}

echo "==> Waiting up to ${WAIT_SEC}s for NTP (step allowed for any offset)"
# Do not use bash SECONDS / date +%s here: chronyc makestep jumps the
# wall clock (UTM pause can be hours), which would end the wait immediately.
tries=$((WAIT_SEC / 2))
if [[ "$tries" -lt 1 ]]; then
  tries=1
fi
ok=0
i=0
while (( i < tries )); do
  chronyc -a makestep >/dev/null 2>&1 || chronyc makestep >/dev/null 2>&1 || true
  if clock_ok; then
    ok=1
    break
  fi
  i=$((i + 1))
  sleep 2
done
if [[ "$ok" != "1" ]] && clock_ok; then
  ok=1
fi

echo "Timezone: $(timedatectl show -p Timezone --value 2>/dev/null || echo unknown)"
echo "Chrony:   $(systemctl is-active chrony 2>/dev/null || systemctl is-active chronyd 2>/dev/null || echo unknown)"
echo "Local:    $(date -Is)"
if command -v chronyc >/dev/null 2>&1; then
  chronyc tracking 2>/dev/null | grep -E 'Leap status|Ref time|System time' || true
fi

if [[ "$ok" == "1" ]]; then
  sync_rtc
  echo "PASS clock within ${MAX_OFFSET_SEC}s of NTP"
  exit 0
fi

echo "FAIL system clock not within ${MAX_OFFSET_SEC}s of NTP after ${WAIT_SEC}s" >&2
if [[ "$REQUIRED" == "1" ]]; then
  exit 1
fi
exit 0
