'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { defaultAnnouncements } = require('../../edge/announce/defaults');
const { evaluateBoard, evaluateTrain, suggestedManualType, arrivalIntervalMinutes } = require('../../edge/announce/engine');
const {
  renderAnnouncement,
  speakDigits,
  speakNumber,
  speakClockTime,
  expandSpokenTimes
} = require('../../edge/announce/normalize');

function cfg(extra) {
  return { ...defaultAnnouncements(), ...extra };
}

function emptyMemory() {
  return { done: {}, delayAnnounced: {}, platform: {}, schedule: {}, arrival: {}, pendingPlatform: {} };
}

test('train numbers are spoken digit by digit', () => {
  assert.match(speakDigits('12789', 'en'), /one two seven eight nine/);
  assert.match(speakDigits('12723', 'en'), /one two seven two three/);
  assert.match(speakDigits('17201', 'te'), /ఒకటి, ఏడు, రెండు, సున్నా, ఒకటి/);
});

test('NTES train names expand for natural English speech', () => {
  const { speakProperName } = require('../../edge/announce/normalize');
  assert.equal(speakProperName('GOLCONDA EXP'), 'Golconda Express');
  assert.equal(speakProperName('SECUNDERABAD JN'), 'Secunderabad Junction');
});

test('pause after train number before platform cue', () => {
  const { ensurePlatformPause, renderAnnouncement } = require('../../edge/announce/normalize');
  assert.match(ensurePlatformPause('రైలు నంబర్ ఒకటి ప్లాట్‌ఫామ్ నంబర్ ఒకటి'), /\. ప్లాట్/);
  const text = renderAnnouncement({
    type: 'arriving',
    lang: 'en',
    config: {
      ...defaultAnnouncements(),
      templates: {
        arriving: {
          en: 'Train number {trainNo} {trainName} will arrive on platform number {platform}.'
        }
      }
    },
    minutes: 5,
    train: { trainNo: '17201', trainName: 'GOLCONDA EXP', platform: '1' }
  });
  assert.match(text, /one\.\s/i);
  assert.match(text, /Express\.\s+will arrive on platform number/i);
  assert.doesNotMatch(text, /on\.\s*platform/i);
});

test('clock times are spoken as hour plus minutes, not digit-wise', () => {
  assert.equal(speakClockTime(3, 15, 'en'), 'three fifteen');
  assert.equal(speakClockTime(3, 0, 'en'), "three o'clock");
  assert.match(speakClockTime(3, 15, 'hi'), /तीन/);
  assert.match(speakClockTime(3, 15, 'hi'), /पंद्रह/);
  assert.equal(expandSpokenTimes('Expected at 3:15 today', 'en'), 'Expected at three fifteen today');
});

test('delay and minute quantities use cardinals, not digit spelling', () => {
  assert.equal(speakNumber(15, 'en'), 'fifteen');
  assert.equal(speakNumber(60, 'en'), 'sixty');
  assert.equal(speakNumber(15, 'hi'), 'पंद्रह');
});

test('language order defaults to Telugu then English then Hindi', () => {
  assert.deepEqual(defaultAnnouncements().languageOrder, ['te', 'en', 'hi']);
});

test('delay of 14 minutes does not announce; 15 does', () => {
  const config = cfg();
  const now = new Date('2026-09-12T12:00:00');
  const base = {
    trainNo: '12723',
    platform: '2',
    runningState: 'scheduled',
    scheduledArrival: '18:00'
  };
  const miss = evaluateTrain({ ...base, delay: 14 }, config, emptyMemory(), now);
  assert.equal(miss.events.some((e) => e.type === 'delayed'), false);
  const hit = evaluateTrain({ ...base, delay: 15 }, config, emptyMemory(), now);
  assert.ok(hit.events.some((e) => e.type === 'delayed'));
});

test('delay first_only does not repeat; step mode does', () => {
  const now = new Date('2026-09-12T12:00:00');
  const train = {
    trainNo: '12723',
    platform: '2',
    delay: 20,
    runningState: 'scheduled',
    scheduledArrival: '18:00'
  };
  const once = cfg({ delay: { minMinutes: 15, mode: 'first_only', stepMinutes: 15 } });
  const memory = emptyMemory();
  memory.delayAnnounced['12723'] = 20;
  memory.done['12723:delayed'] = { at: 'x' };
  assert.equal(evaluateTrain({ ...train, delay: 40 }, once, memory, now).events.some((e) => e.type === 'delayed'), false);
  const stepped = cfg({ delay: { minMinutes: 15, mode: 'first_then_step', stepMinutes: 15 } });
  assert.ok(evaluateTrain({ ...train, delay: 35 }, stepped, memory, now).events.some((e) => e.type === 'delayed'));
});

test('arriving cadence uses STA not ETA', () => {
  const config = cfg();
  const now = new Date('2026-09-12T17:50:00');
  const train = {
    trainNo: '17014',
    platform: '1',
    runningState: 'scheduled',
    delay: 40,
    scheduledArrival: '18:00',
    expectedArrival: '18:40'
  };
  const { events } = evaluateTrain(train, config, emptyMemory(), now);
  const arriving = events.find((e) => e.type === 'arriving');
  assert.ok(arriving);
  assert.equal(arriving.minutes, 10);
});

test('exactly 15 minutes before STA uses the 5-minute window', () => {
  assert.equal(arrivalIntervalMinutes(16, defaultAnnouncements()), 3);
  assert.equal(arrivalIntervalMinutes(15, defaultAnnouncements()), 5);
  assert.equal(arrivalIntervalMinutes(0, defaultAnnouncements()), 5);
  assert.equal(arrivalIntervalMinutes(31, defaultAnnouncements()), null);
});

test('short-notice train fires twice within the remaining window', () => {
  const config = cfg();
  const train = {
    trainNo: '67763',
    platform: '1',
    runningState: 'scheduled',
    scheduledArrival: '12:04'
  };
  const firstNow = new Date('2026-09-12T12:01:00');
  const firstBoard = evaluateBoard({
    trains: [train],
    config,
    memory: emptyMemory(),
    now: firstNow,
    stale: false
  });
  assert.equal(firstBoard.events.filter((e) => e.type === 'arriving').length, 1);
  const tooSoon = evaluateBoard({
    trains: [train],
    config,
    memory: firstBoard.memory,
    now: new Date('2026-09-12T12:01:20'),
    stale: false
  });
  assert.equal(tooSoon.events.filter((e) => e.type === 'arriving').length, 0);
  const second = evaluateBoard({
    trains: [train],
    config,
    memory: tooSoon.memory,
    now: new Date('2026-09-12T12:02:31'),
    stale: false
  });
  assert.equal(second.events.filter((e) => e.type === 'arriving').length, 1);
});

test('arriving fires when runningState is arrived', () => {
  const config = cfg();
  const { events } = evaluateTrain(
    { trainNo: '1', platform: '1', runningState: 'arrived', delay: 0, scheduledArrival: '11:00' },
    config,
    emptyMemory(),
    new Date('2026-09-12T12:00:00')
  );
  assert.ok(events.some((e) => e.type === 'arriving' && e.atPlatform));
});

test('stale NTES stop policy yields no auto events', () => {
  const config = cfg({ staleNtes: 'stop' });
  const { events } = evaluateBoard({
    trains: [{ trainNo: '1', delay: 40, runningState: 'scheduled', platform: '1', scheduledArrival: '18:00' }],
    config,
    memory: emptyMemory(),
    now: new Date('2026-09-12T17:50:00'),
    stale: true
  });
  assert.equal(events.length, 0);
});

test('cancelled auto-announces by default', () => {
  const config = cfg();
  const { events } = evaluateTrain(
    { trainNo: '1', status: 'Cancelled', runningState: 'cancelled', platform: '1' },
    config,
    emptyMemory(),
    new Date()
  );
  assert.ok(events.some((e) => e.type === 'cancelled'));
  const text = renderAnnouncement({
    type: 'departed',
    lang: 'en',
    config,
    train: { trainNo: '12723', trainName: 'Satavahana Express', platform: '2' }
  });
  assert.match(text, /will depart/i);
  assert.doesNotMatch(text, /has departed/i);
});

test('suggested manual type follows current train status', () => {
  assert.equal(
    suggestedManualType({ runningState: 'cancelled', status: 'Cancelled' }),
    'cancelled'
  );
  assert.equal(suggestedManualType({ runningState: 'departed' }), 'departing');
  assert.equal(suggestedManualType({ runningState: 'arrived' }), 'arriving');
  assert.equal(suggestedManualType({ runningState: 'scheduled', delay: 20, status: 'Late by 20 mins' }), 'delayed');
});

test('platform change stays pending until staff confirm', () => {
  const config = cfg();
  const memory = emptyMemory();
  memory.platform['1'] = '2';
  const { events, pending } = evaluateTrain(
    { trainNo: '1', platform: '4', runningState: 'scheduled', delay: 0, scheduledArrival: '18:00' },
    config,
    memory,
    new Date('2026-09-12T12:00:00')
  );
  assert.equal(events.some((e) => e.type === 'platform_changed'), false);
  assert.equal(pending.length, 1);
  assert.equal(pending[0].to, '4');
});

test('reschedule fires when STA changes after first sighting', () => {
  const config = cfg();
  const memory = emptyMemory();
  memory.schedule['1'] = { sta: '18:00', std: '18:05' };
  const { events } = evaluateTrain(
    {
      trainNo: '1',
      platform: '1',
      runningState: 'scheduled',
      scheduledArrival: '19:10',
      scheduledDeparture: '19:15'
    },
    config,
    memory,
    new Date('2026-09-12T12:00:00')
  );
  assert.ok(events.some((e) => e.type === 'rescheduled'));
});

test('Telugu arriving uses IR PA attention and platform number framing', () => {
  const config = cfg();
  const text = renderAnnouncement({
    type: 'arriving',
    lang: 'te',
    config,
    minutes: 12,
    train: {
      trainNo: '12723',
      trainName: 'సతవాహన ఎక్స్‌ప్రెస్',
      platform: '2',
      from: 'సికింద్రాబాద్',
      to: 'విజయవాడ'
    }
  });
  assert.match(text, /యాత్రీకుల/);
  assert.match(text, /ప్లాట్‌ఫామ్ నంబర్/);
  assert.match(text, /ఒకటి, రెండు, ఏడు, రెండు, మూడు/);
  assert.match(text, /సికింద్రాబాద్/);
  assert.match(text, /విజయవాడ/);
  assert.doesNotMatch(text, /^దయచేసి శ్రద్ధ/);
});

test('Telugu delayed keeps minutes and PA opener', () => {
  const config = cfg();
  const text = renderAnnouncement({
    type: 'delayed',
    lang: 'te',
    config,
    train: { trainNo: '17014', trainName: 'Test', platform: '1', delay: 60 }
  });
  assert.match(text, /యాత్రీకుల/);
  assert.match(text, /అరవై/); // 60 as cardinal, not digit-wise ఆరు సున్నా
  assert.match(text, /నిమిషాలు ఆలస్యం/);
});

test('empty from/to does not leave route debris', () => {
  const config = cfg();
  const text = renderAnnouncement({
    type: 'departing',
    lang: 'en',
    config,
    train: { trainNo: '1', trainName: 'X', platform: '3' }
  });
  assert.match(text, /will depart/i);
  assert.doesNotMatch(text, /\bto\s+\./i);
  assert.doesNotMatch(text, /from\s+to/i);
});
