'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mergeOverlay } = require('../../edge/overlay/merge');

test('overlay wins on nested keys and replaces arrays', () => {
  const base = { a: 1, nested: { x: 1, y: 2 }, amenities: [{ id: 'a' }] };
  const overlay = { nested: { y: 9 }, amenities: [{ id: 'b' }] };
  const out = mergeOverlay(base, overlay);
  assert.equal(out.a, 1);
  assert.equal(out.nested.x, 1);
  assert.equal(out.nested.y, 9);
  assert.deepEqual(out.amenities, [{ id: 'b' }]);
});

test('missing overlay leaves base unchanged', () => {
  const base = { a: 1 };
  assert.deepEqual(mergeOverlay(base, undefined), { a: 1 });
  assert.deepEqual(mergeOverlay(base, null), null);
});
