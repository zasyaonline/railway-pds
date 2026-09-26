#!/usr/bin/env bash
# Install 24h announce cadence monitor on the appliance.
set -euo pipefail
if [[ "$(id -u)" -ne 0 ]]; then exec sudo -E bash "$0" "$@"; fi

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
install -d -m 0755 /var/log/zasya/announce-monitor/hourly
install -m 0755 "$SRC/zasya-announce-monitor.py" /usr/local/sbin/zasya-announce-monitor.py
install -m 0644 "$SRC/zasya-announce-collect.service" /etc/systemd/system/zasya-announce-collect.service
install -m 0644 "$SRC/zasya-announce-collect.timer" /etc/systemd/system/zasya-announce-collect.timer
install -m 0644 "$SRC/zasya-announce-hourly.service" /etc/systemd/system/zasya-announce-hourly.service
install -m 0644 "$SRC/zasya-announce-hourly.timer" /etc/systemd/system/zasya-announce-hourly.timer
install -m 0644 "$SRC/zasya-announce-monitor-stop.service" /etc/systemd/system/zasya-announce-monitor-stop.service
install -m 0644 "$SRC/zasya-announce-monitor-stop.timer" /etc/systemd/system/zasya-announce-monitor-stop.timer

systemctl daemon-reload
systemctl enable --now zasya-announce-collect.timer
systemctl enable --now zasya-announce-hourly.timer
systemctl enable --now zasya-announce-monitor-stop.timer

# Seed collector + first status immediately
python3 /usr/local/sbin/zasya-announce-monitor.py collect
python3 /usr/local/sbin/zasya-announce-monitor.py status
# Write a mid-hour baseline review for the current partial hour
python3 /usr/local/sbin/zasya-announce-monitor.py hourly || true

echo "Monitor installed. Logs: /var/log/zasya/announce-monitor/"
echo "Hourly reviews: /var/log/zasya/announce-monitor/hourly/"
echo "Stops automatically after 24h and writes summary.md"
systemctl list-timers 'zasya-announce*' --no-pager
