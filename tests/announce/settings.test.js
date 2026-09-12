'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { test } = require('node:test');
const assert = require('node:assert/strict');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zasya-aset-'));
process.env.ZASYA_RAILWAY_ROOT = root;
process.env.ZASYA_RAILWAY_ETC = path.join(root, 'etc');
fs.mkdirSync(path.join(root, 'etc', 'overlays', 'BG'), { recursive: true });

delete require.cache[require.resolve('../../shared/paths')];
delete require.cache[require.resolve('../../edge/overlay/load')];
delete require.cache[require.resolve('../../edge/announce/config')];
delete require.cache[require.resolve('../../edge/announce/settings-schema')];

const {
  loadAnnouncementConfig,
  saveAnnouncementSettings,
  resetAnnouncementSettings,
  announcementSettingsEnvelope
} = require('../../edge/announce/config');

test('settings round-trip writes overlay and reloads', () => {
  const saved = saveAnnouncementSettings('BG', {
    settings: {
      languageOrder: ['te', 'en'],
      delay: { minMinutes: 20, mode: 'first_then_step' },
      staleNtes: 'stop'
    }
  }, 'tester');
  assert.equal(saved.stationCode, 'BG');
  assert.equal(saved.source, 'overlay');
  assert.equal(saved.settings.delay.minMinutes, 20);
  assert.deepEqual(saved.settings.languageOrder, ['te', 'en']);
  const loaded = loadAnnouncementConfig('BG');
  assert.equal(loaded.delay.minMinutes, 20);
  const reset = resetAnnouncementSettings('BG', 'tester');
  assert.equal(reset.source, 'defaults');
  assert.equal(reset.settings.delay.minMinutes, 15);
  const env = announcementSettingsEnvelope('BG');
  assert.equal(env.settings.staleNtes, 'stop');
});
