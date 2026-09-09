'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { test } = require('node:test');
const assert = require('node:assert/strict');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zasya-ov-'));
process.env.ZASYA_RAILWAY_ROOT = root;
process.env.ZASYA_RAILWAY_ETC = path.join(root, 'etc');
fs.mkdirSync(path.join(root, 'etc', 'overlays', 'BG'), { recursive: true });

delete require.cache[require.resolve('../../shared/paths')];
delete require.cache[require.resolve('../../edge/overlay/load')];
delete require.cache[require.resolve('../../edge/storage/atomic-file')];

const dataDir = path.join(root, 'coach');
fs.mkdirSync(path.join(dataDir, 'stations', 'BG'), { recursive: true });
fs.writeFileSync(
  path.join(dataDir, 'stations', 'BG', 'layout.json'),
  JSON.stringify({ code: 'BG', amenities: [{ id: 'toilet' }] })
);
fs.writeFileSync(
  path.join(root, 'etc', 'overlays', 'BG', 'layout.json'),
  JSON.stringify({ amenities: [{ id: 'fob' }] })
);

const { loadStationDocument } = require('../../edge/overlay/load');

test('station overlay merges onto repo layout', () => {
  const doc = loadStationDocument({
    dataDir,
    stationCode: 'BG',
    fileName: 'layout.json'
  });
  assert.equal(doc.code, 'BG');
  assert.equal(doc.amenities[0].id, 'fob');
});

test('missing overlay returns repo document', () => {
  const doc = loadStationDocument({
    dataDir,
    stationCode: 'BG',
    fileName: 'displays.json'
  });
  assert.equal(doc, null);
  fs.writeFileSync(
    path.join(dataDir, 'stations', 'BG', 'displays.json'),
    JSON.stringify({ stationCode: 'BG', displays: [{ id: 'entrance-main' }] })
  );
  const loaded = loadStationDocument({
    dataDir,
    stationCode: 'BG',
    fileName: 'displays.json'
  });
  assert.equal(loaded.stationCode, 'BG');
  assert.equal(loaded.displays[0].id, 'entrance-main');
});
