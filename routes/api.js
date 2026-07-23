'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const { buildDisplayList } = require('../services/mergeService');
const {
  emptyStore,
  touchSession,
  listActive,
  stopSession,
  stopAll,
  STALE_MS
} = require('../services/sessionService');
const { STATION_PRESETS, resolveStationInput } = require('../services/stationCatalog');

function createApiRouter(deps) {
  const router = express.Router();
  const { getCache, startRefresh, stopRefresh, saveConfig } = deps;
  const dataDir = path.join(__dirname, '..', 'data');
  const sessionsPath = path.join(dataDir, 'sessions.json');
  const adminKey = process.env.ADMIN_KEY || 'chz-ops';

  function readSessions() {
    try {
      return JSON.parse(fs.readFileSync(sessionsPath, 'utf8'));
    } catch {
      return emptyStore();
    }
  }

  function writeSessions(store) {
    fs.writeFileSync(sessionsPath, JSON.stringify(store, null, 2));
  }

  function requireAdmin(req, res) {
    const provided = req.get('x-admin-key') || req.query.adminKey || req.query.key || '';
    if (!provided || provided !== adminKey) {
      res.status(401).json({ error: 'Admin key required' });
      return false;
    }
    return true;
  }

  function registerViewer(req, res) {
    const sessionId = req.get('x-session-id') || req.query.sessionId || req.query.sid;
    if (!sessionId) return true;

    const store = readSessions();
    const result = touchSession(store, {
      id: String(sessionId),
      userAgent: req.get('user-agent') || ''
    });
    writeSessions(result.store);

    if (result.killed) {
      res.set('Cache-Control', 'no-store');
      res.status(409).json({
        error: 'session_stopped',
        message: 'This display session was stopped by an administrator'
      });
      return false;
    }
    return true;
  }

  router.get('/trains', (req, res) => {
    if (!registerViewer(req, res)) return;

    const cache = getCache();
    if (!cache.boardTrains) {
      return res.status(503).json({ error: 'Data not yet loaded' });
    }

    const trains = buildDisplayList(cache.boardTrains, cache.config);
    res.json({
      stationCode: cache.config.stationCode,
      stationName: cache.config.stationName,
      lastUpdated: cache.lastUpdated,
      refreshInterval: cache.config.refreshInterval,
      refreshEnabled: cache.config.refreshEnabled !== false,
      source: 'NTES Live Station',
      trains
    });
  });

  router.get('/refresh/status', (req, res) => {
    const cache = getCache();
    res.json({
      refreshEnabled: cache.config.refreshEnabled !== false,
      refreshInterval: cache.config.refreshInterval || 30
    });
  });

  router.post('/refresh/start', async (req, res) => {
    const cache = getCache();
    cache.config.refreshEnabled = true;
    saveConfig(cache.config);
    await startRefresh();
    res.json({ refreshEnabled: true, message: 'Refresh started' });
  });

  router.post('/refresh/stop', (req, res) => {
    const cache = getCache();
    cache.config.refreshEnabled = false;
    saveConfig(cache.config);
    stopRefresh();
    res.json({ refreshEnabled: false, message: 'Refresh stopped' });
  });

  router.get('/health', (req, res) => {
    const cache = getCache();
    const sessions = listActive(readSessions());
    res.json({
      status: 'ok',
      refreshEnabled: cache.config.refreshEnabled !== false,
      boardTrainCount: cache.boardTrains?.length ?? 0,
      displayTrainCount: buildDisplayList(cache.boardTrains || [], cache.config || {}).length,
      activeSessions: sessions.length,
      lastUpdated: cache.lastUpdated,
      stationCode: cache.config?.stationCode,
      stationName: cache.config?.stationName
    });
  });

  router.get('/admin/sessions', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const cache = getCache();
    const sessions = listActive(readSessions());
    res.json({
      activeCount: sessions.length,
      sessions,
      refreshEnabled: cache.config.refreshEnabled !== false,
      refreshInterval: cache.config.refreshInterval || 30,
      staleAfterSeconds: Math.floor(STALE_MS / 1000),
      stationCode: cache.config.stationCode || 'CHZ',
      stationName: cache.config.stationName || 'Charlapalli',
      stationPresets: STATION_PRESETS
    });
  });

  router.post('/admin/station', async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const resolved = resolveStationInput(req.body || {});
    if (!resolved.ok) {
      return res.status(400).json({ error: resolved.error });
    }

    const cache = getCache();
    cache.config.stationCode = resolved.stationCode;
    cache.config.stationName = resolved.stationName;
    saveConfig(cache.config);

    let refresh = null;
    try {
      if (cache.config.refreshEnabled !== false) {
        await startRefresh();
        refresh = { ok: true, lastUpdated: getCache().lastUpdated };
      } else {
        refresh = { ok: false, reason: 'refresh disabled' };
      }
    } catch (err) {
      refresh = { ok: false, reason: err.message };
    }

    res.json({
      stationCode: cache.config.stationCode,
      stationName: cache.config.stationName,
      message: `Station set to ${cache.config.stationName} (${cache.config.stationCode})`,
      refresh
    });
  });

  router.post('/admin/sessions/stop', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const sessionId = req.body?.sessionId || req.body?.id;
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId required' });
    }
    const store = readSessions();
    const result = stopSession(store, String(sessionId));
    writeSessions(result.store);
    if (!result.found) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json({ stopped: true, sessionId: String(sessionId) });
  });

  router.post('/admin/sessions/stop-all', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const store = readSessions();
    const result = stopAll(store);
    writeSessions(result.store);
    res.json({ stopped: result.count, message: `Stopped ${result.count} session(s)` });
  });

  return router;
}

module.exports = createApiRouter;
