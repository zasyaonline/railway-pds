'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { wavLooksValid } = require('../../edge/announce/player');

test('wavLooksValid rejects missing and tiny files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zasya-wav-'));
  assert.equal(wavLooksValid(path.join(dir, 'nope.wav')), false);
  const tiny = path.join(dir, 'tiny.wav');
  fs.writeFileSync(tiny, 'RIFF');
  assert.equal(wavLooksValid(tiny), false);
  const ok = path.join(dir, 'ok.wav');
  fs.writeFileSync(ok, Buffer.alloc(80, 1));
  assert.equal(wavLooksValid(ok), true);
});
