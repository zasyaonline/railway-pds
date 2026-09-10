'use strict';

const { execFileSync } = require('child_process');
const { isObviouslyInvalidDate, nowIso } = require('../../shared/time');

const DEFAULT_MAX_OFFSET_SEC = 2;

function maxOffsetSec() {
  const n = Number(process.env.ZASYA_MAX_CLOCK_OFFSET_SEC);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_OFFSET_SEC;
}

function run(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', timeout: 2000 }).trim();
  } catch {
    return null;
  }
}

function parseChronyOffsetSeconds(text) {
  if (!text) return null;
  const m = /System time\s*:\s*([0-9.]+)\s+seconds\s+(slow|fast)/i.exec(text);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function parseChronyTracking(text, maxOffset = maxOffsetSec()) {
  if (!text) return { ok: false, lastTimeSync: null, offsetSeconds: null, leapOk: false };
  const leapOk = /Leap status\s*:\s*Normal/i.test(text);
  const offsetSeconds = parseChronyOffsetSeconds(text);
  const offsetOk = offsetSeconds != null && offsetSeconds <= maxOffset;
  const ok = leapOk && offsetOk;
  let lastTimeSync = null;
  const ref = /Ref time \(UTC\)\s*:\s*(.+)/i.exec(text);
  if (ref && ref[1] && !/unspecified/i.test(ref[1])) {
    const parsed = new Date(`${ref[1].trim()} UTC`);
    if (!Number.isNaN(parsed.getTime())) lastTimeSync = parsed.toISOString();
  }
  return { ok, lastTimeSync, offsetSeconds, leapOk };
}

function parseTimezone(timedatectlShow) {
  if (!timedatectlShow) return null;
  const m = /^Timezone=(.+)$/m.exec(timedatectlShow);
  if (m) return m[1].trim();
  const value = timedatectlShow.trim();
  return value && !value.includes('=') ? value : null;
}

function readTimeSync() {
  const systemTime = nowIso();
  const clockAbnormal = isObviouslyInvalidDate(new Date());
  let lastTimeSync = null;
  let timeSyncStatus = 'unknown';
  let clockOffsetSeconds = null;

  const timezone =
    run('timedatectl', ['show', '-p', 'Timezone', '--value']) ||
    parseTimezone(run('timedatectl', ['show', '-p', 'Timezone'])) ||
    null;

  /* Chrony is the appliance NTP client. timedatectl NTPSynchronized often stays
     "no" while chrony Leap status is Normal — treat chrony as source of truth.
     Leap Normal alone is not enough: after a VM pause chrony may slew a
     multi-hour offset and still report Normal. */
  const chronyc = run('chronyc', ['tracking']);
  const chrony = parseChronyTracking(chronyc);
  clockOffsetSeconds = chrony.offsetSeconds;
  if (chronyc) {
    if (chrony.ok) {
      timeSyncStatus = 'healthy';
      lastTimeSync = chrony.lastTimeSync;
    } else {
      timeSyncStatus = 'degraded';
      lastTimeSync = chrony.lastTimeSync;
    }
  }

  const timedatectl = run('timedatectl', ['show', '-p', 'NTPSynchronized', '-p', 'LastSynchronizationTimestamp']);
  if (timedatectl) {
    const ntp = /NTPSynchronized=(yes|no)/i.exec(timedatectl);
    const last = /LastSynchronizationTimestamp=(.+)/.exec(timedatectl);
    if (!lastTimeSync && last && last[1] && last[1] !== 'n/a' && last[1] !== '') {
      const parsed = new Date(last[1]);
      if (!Number.isNaN(parsed.getTime())) lastTimeSync = parsed.toISOString();
    }
    if (!chronyc && ntp && ntp[1].toLowerCase() === 'yes') {
      timeSyncStatus = 'healthy';
    }
  }

  if (clockAbnormal) timeSyncStatus = 'invalid';
  if (timeSyncStatus === 'unknown') timeSyncStatus = 'unavailable';

  return {
    systemTime,
    lastTimeSync,
    timeSyncStatus,
    clockAbnormal,
    clockOffsetSeconds,
    timezone
  };
}

module.exports = {
  readTimeSync,
  parseChronyTracking,
  parseChronyOffsetSeconds,
  parseTimezone
};
