'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { test } = require('node:test');
const assert = require('node:assert/strict');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zasya-ann-http-'));
process.env.ZASYA_RAILWAY_ROOT = root;
process.env.ZASYA_RAILWAY_ETC = path.join(root, 'etc');
process.env.ZASYA_RAILWAY_LOG = path.join(root, 'log');
fs.mkdirSync(process.env.ZASYA_RAILWAY_ETC, { recursive: true });

const { saveAdminSecret } = require('../../edge/admin/auth');
const { saveConfig } = require('../../edge/config/config-service');
const { resetAnnounceRuntime } = require('../../edge/announce/service');
const { createAdminApp } = require('../../edge/admin/server');

saveConfig({ stationCode: 'BG', stationName: 'Bhongir', licence: { gracePeriodHours: 1 } });
saveAdminSecret('test-admin-secret');
resetAnnounceRuntime();

function listen(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

test('announcement status requires admin', async () => {
  const server = await listen(createAdminApp());
  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}/api/admin/announcements`);
  assert.equal(res.status, 401);
  const ok = await fetch(`http://127.0.0.1:${port}/api/admin/announcements`, {
    headers: { 'X-Admin-Key': 'test-admin-secret' }
  });
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.autoEnabled, true);
  server.close();
});

test('manual announcement queues without crashing if TTS is missing', async () => {
  const server = await listen(createAdminApp());
  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}/api/admin/announcements/manual`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Key': 'test-admin-secret'
    },
    body: JSON.stringify({ type: 'delayed', trainNo: '12723', platform: '2' })
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.job.trainNo, '12723');
  server.close();
});

test('settings GET and PUT require admin and persist overlay', async () => {
  const server = await listen(createAdminApp());
  const { port } = server.address();
  const denied = await fetch(`http://127.0.0.1:${port}/api/admin/announcements/settings`);
  assert.equal(denied.status, 401);
  const got = await fetch(`http://127.0.0.1:${port}/api/admin/announcements/settings`, {
    headers: { 'X-Admin-Key': 'test-admin-secret' }
  });
  assert.equal(got.status, 200);
  const body = await got.json();
  assert.equal(body.settings.staleNtes, 'stop');
  assert.deepEqual(body.settings.languageOrder, ['te', 'en', 'hi']);
  const put = await fetch(`http://127.0.0.1:${port}/api/admin/announcements/settings`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Key': 'test-admin-secret'
    },
    body: JSON.stringify({ settings: { delay: { minMinutes: 25 } } })
  });
  assert.equal(put.status, 200);
  const saved = await put.json();
  assert.equal(saved.settings.delay.minMinutes, 25);
  await fetch(`http://127.0.0.1:${port}/api/admin/announcements/settings/reset`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Key': 'test-admin-secret'
    },
    body: '{}'
  });
  server.close();
});

test('manual announcement infers type from delay when type is omitted', async () => {
  const server = await listen(createAdminApp());
  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}/api/admin/announcements/manual`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Key': 'test-admin-secret'
    },
    body: JSON.stringify({
      trainNo: '67780',
      platform: '1',
      delay: 22,
      runningState: 'scheduled',
      status: 'Late by 22 mins'
    })
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.job.type, 'delayed');
  assert.equal(body.job.trainNo, '67780');
  server.close();
});
