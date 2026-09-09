'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { test } = require('node:test');
const assert = require('node:assert/strict');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zasya-acfg-'));
process.env.ZASYA_RAILWAY_ROOT = root;
process.env.ZASYA_RAILWAY_ETC = path.join(root, 'etc');
fs.mkdirSync(path.join(root, 'etc', 'overlays', 'BG'), { recursive: true });
delete require.cache[require.resolve('../../shared/paths')];
delete require.cache[require.resolve('../../edge/overlay/load')];
delete require.cache[require.resolve('../../edge/announce/config')];

const dataDir = path.join(root, 'coach');
fs.mkdirSync(path.join(dataDir, 'stations', 'BG'), { recursive: true });
fs.writeFileSync(
  path.join(dataDir, 'stations', 'BG', 'announcements.json'),
  JSON.stringify({ stationCode: 'BG' })
);
fs.writeFileSync(
  path.join(root, 'etc', 'overlays', 'BG', 'announcements.json'),
  JSON.stringify({ delay: { minMinutes: 10 } })
);

const { loadAnnouncementConfig } = require('../../edge/announce/config');

test('announcement config is defaults then repo then overlay', () => {
  const cfg = loadAnnouncementConfig('BG', dataDir);
  assert.equal(cfg.stationCode, 'BG');
  assert.equal(cfg.delay.minMinutes, 10);
  assert.equal(cfg.delay.stepMinutes, 15);
  assert.ok(cfg.templates.arriving.en);
});
