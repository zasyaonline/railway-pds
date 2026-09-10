'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseChronyTracking,
  parseChronyOffsetSeconds,
  parseTimezone
} = require('../../edge/health/time-sync');

const healthySample = `
Reference ID    : A29FC87B (time.cloudflare.com)
Stratum         : 3
Ref time (UTC)  : Tue Aug 25 10:30:00 2026
System time     : 0.000123456 seconds slow of NTP time
Last offset     : +0.000012345 seconds
RMS offset      : 0.000045678 seconds
Frequency       : 12.345 ppm slow
Residual freq   : +0.001 ppm
Skew            : 0.123 ppm
Root delay      : 0.012345678 seconds
Root dispersion : 0.001234567 seconds
Update interval : 64.0 seconds
Leap status     : Normal
`;

test('chrony Leap Normal and small offset is healthy', () => {
  const parsed = parseChronyTracking(healthySample);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.leapOk, true);
  assert.ok(parsed.lastTimeSync);
  assert.equal(parsed.lastTimeSync, '2026-08-25T10:30:00.000Z');
  assert.ok(parsed.offsetSeconds < 1);
});

test('Leap Normal with multi-hour offset is not healthy', () => {
  const paused = healthySample.replace(
    'System time     : 0.000123456 seconds slow of NTP time',
    'System time     : 72000.5 seconds slow of NTP time'
  );
  const parsed = parseChronyTracking(paused);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.leapOk, true);
  assert.equal(parsed.offsetSeconds, 72000.5);
});

test('parses System time offset seconds', () => {
  assert.equal(parseChronyOffsetSeconds(healthySample), 0.000123456);
  assert.equal(
    parseChronyOffsetSeconds('System time     : 3.2 seconds fast of NTP time'),
    3.2
  );
  assert.equal(parseChronyOffsetSeconds(''), null);
});

test('chrony not Normal is not healthy', () => {
  assert.equal(parseChronyTracking('Leap status     : Not synchronized').ok, false);
  assert.equal(parseChronyTracking('').ok, false);
});

test('parses timedatectl Timezone=Asia/Kolkata', () => {
  assert.equal(parseTimezone('Timezone=Asia/Kolkata'), 'Asia/Kolkata');
  assert.equal(parseTimezone('Asia/Kolkata'), 'Asia/Kolkata');
});
