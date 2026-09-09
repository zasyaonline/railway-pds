'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { test } = require('node:test');
const assert = require('node:assert/strict');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zasya-tts-'));
process.env.ZASYA_RAILWAY_ROOT = root;
process.env.ZASYA_RAILWAY_ETC = path.join(root, 'etc');
fs.mkdirSync(path.join(root, 'tts', 'cache'), { recursive: true });

delete require.cache[require.resolve('../../shared/paths')];
delete require.cache[require.resolve('../../edge/tts/synthesize')];

const { synthesize, cacheKey } = require('../../edge/tts/synthesize');

test('empty text fails open', async () => {
  const result = await synthesize('', 'en');
  assert.equal(result.ok, false);
  assert.equal(result.failOpen, true);
});

test('missing piper fails open without throwing', async () => {
  process.env.ZASYA_PIPER_BIN = path.join(root, 'no-piper');
  const result = await synthesize('Attention please.', 'en', '', { engine: 'piper', skipCache: true });
  assert.equal(result.ok, false);
  assert.equal(result.failOpen, true);
});

test('cache key is stable', () => {
  assert.equal(
    cacheKey({ engine: 'espeak', language: 'en', voice: '', text: 'a', profile: 'pa-v3' }),
    cacheKey({ engine: 'espeak', language: 'en', voice: '', text: 'a', profile: 'pa-v3' })
  );
  assert.notEqual(
    cacheKey({ engine: 'espeak', language: 'en', voice: '', text: 'a', profile: 'pa-v3' }),
    cacheKey({ engine: 'espeak', language: 'en', voice: '', text: 'a', profile: '' })
  );
});
