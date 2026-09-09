'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { defaultAnnouncements } = require('../../edge/announce/defaults');
const { evaluateBoard, evaluateTrain } = require('../../edge/announce/engine');
const { renderAnnouncement, speakDigits } = require('../../edge/announce/normalize');

function cfg(extra) {
  return { ...defaultAnnouncements(), ...extra };
}

test('train numbers are spoken digit by digit', () => {
  assert.match(speakDigits('12723', 'en'), /one two seven two three/);
});

test('delay announces once then again after step', () => {
  const config = cfg();
  const now = new Date('2026-09-09T12:00:00');
  const train = {
    trainNo: '12723',
    trainName: 'Satavahana Express',
    platform: '2',
    delay: 20,
    runningState: 'scheduled',
    expectedArrival: '18:00'
  };
  const memory = { done: {}, delayAnnounced: {}, platform: {} };
  const first = evaluateTrain(train, config, memory, now);
  assert.ok(first.some((e) => e.type === 'delayed'));
  memory.delayAnnounced['12723'] = 20;
  memory.done['12723:delayed'] = { at: 'x' };
  const second = evaluateTrain({ ...train, delay: 25 }, config, memory, now);
  assert.equal(second.some((e) => e.type === 'delayed'), false);
  const third = evaluateTrain({ ...train, delay: 35 }, config, memory, now);
  assert.ok(third.some((e) => e.type === 'delayed'));
});

test('arriving fires when runningState is arrived', () => {
  const config = cfg();
  const events = evaluateTrain(
    { trainNo: '1', platform: '1', runningState: 'arrived', delay: 0 },
    config,
    { done: {}, delayAnnounced: {}, platform: {} },
    new Date()
  );
  assert.ok(events.some((e) => e.type === 'arriving'));
});

test('stale NTES stop policy yields no auto events', () => {
  const config = cfg({ staleNtes: 'stop' });
  const { events } = evaluateBoard({
    trains: [{ trainNo: '1', delay: 40, runningState: 'scheduled', platform: '1' }],
    config,
    memory: {},
    now: new Date(),
    stale: true
  });
  assert.equal(events.length, 0);
});

test('cancelled is suppressed by default but templates still render', () => {
  const config = cfg();
  const events = evaluateTrain(
    { trainNo: '1', status: 'Cancelled', runningState: 'cancelled', platform: '1' },
    config,
    { done: {} },
    new Date()
  );
  assert.equal(events.length, 0);
  const text = renderAnnouncement({
    type: 'cancelled',
    lang: 'en',
    config,
    train: { trainNo: '12723', trainName: 'Satavahana Express' }
  });
  assert.match(text, /cancelled/i);
});

test('suggested manual type follows current train status', () => {
  const { suggestedManualType } = require('../../edge/announce/engine');
  assert.equal(
    suggestedManualType({ runningState: 'cancelled', status: 'Cancelled' }),
    'cancelled'
  );
  assert.equal(suggestedManualType({ runningState: 'departed' }), 'departed');
  assert.equal(suggestedManualType({ runningState: 'arrived' }), 'arriving');
  assert.equal(suggestedManualType({ runningState: 'scheduled', delay: 20, status: 'Late by 20 mins' }), 'delayed');
  assert.equal(suggestedManualType({ runningState: 'scheduled', delay: 5, status: 'Late by 5 mins' }), 'arriving');
  assert.equal(
    suggestedManualType(
      { runningState: 'scheduled', delay: 0, expectedArrival: '12:10' },
      new Date('2026-09-09T12:00:00')
    ),
    'approaching'
  );
  assert.equal(
    suggestedManualType(
      { runningState: 'scheduled', delay: 0, expectedArrival: '18:00' },
      new Date('2026-09-09T12:00:00')
    ),
    'arriving'
  );
});

test('platform change stays staff-confirm by default', () => {
  const config = cfg();
  const memory = { done: {}, platform: { '1': '2' } };
  const events = evaluateTrain(
    { trainNo: '1', platform: '4', runningState: 'scheduled', delay: 0 },
    config,
    memory,
    new Date()
  );
  assert.equal(events.some((e) => e.type === 'platform_changed'), false);
});
