'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const { buildCoachBoard } = require('../services/boardBuilder');
const { fetchLiveStationBoard } = require('../services/liveBoardService');
const { resolveStationFromNtes } = require('../../services/ntesClient');
const {
  emptyStore,
  touchSession,
  listActive,
  stopSession,
  stopAll,
  STALE_MS
} = require('../../services/sessionService');

function createApiRouter(deps) {
  const router = express.Router();
  const { dataDir, adminKey } = deps;

  function readJson(name, fallback) {
    try {
      return JSON.parse(fs.readFileSync(path.join(dataDir, name), 'utf8'));
    } catch {
      return fallback;
    }
  }

  function writeJson(name, doc) {
    fs.writeFileSync(path.join(dataDir, name), JSON.stringify(doc, null, 2));
  }

  function readSessions() {
    try {
      return JSON.parse(fs.readFileSync(path.join(dataDir, 'sessions.json'), 'utf8'));
    } catch {
      return emptyStore();
    }
  }

  function writeSessions(store) {
    fs.writeFileSync(path.join(dataDir, 'sessions.json'), JSON.stringify(store, null, 2));
  }

  function registerViewer(req, res) {
    const sessionId = req.get('x-session-id') || req.query.sessionId || req.query.sid;
    if (!sessionId) return true;
    const result = touchSession(readSessions(), {
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

  function requireAdmin(req, res) {
    const key = process.env.ADMIN_KEY || adminKey || 'coach-ops';
    const provided = req.get('x-admin-key') || req.query.adminKey || req.query.key || '';
    if (!provided || provided !== key) {
      res.status(401).json({ error: 'Admin key required' });
      return false;
    }
    return true;
  }

  router.get('/health', (req, res) => {
    const displays = readJson('coach_displays.json', { displays: [] });
    res.json({
      status: 'ok',
      app: 'coach-position',
      stationCode: displays.stationCode || null,
      dataSource: 'ntes-live',
      displayCount: (displays.displays || []).length,
      activeSessions: listActive(readSessions()).length
    });
  });

  router.get('/coach-board', async (req, res) => {
    if (!registerViewer(req, res)) return;
    const displaysDoc = readJson('coach_displays.json', null);
    const typesDoc = readJson('coach_types.json', { types: {}, codeRules: [] });
    if (!displaysDoc) return res.status(503).json({ error: 'Config missing' });

    const displayId = req.query.display || displaysDoc.displays?.[0]?.id;
    const stationLayout = readJson('station_layout.json', null);
    const hours = displaysDoc.lookAheadHours || Number(process.env.COACH_LOOKAHEAD_HOURS) || 4;

    let live;
    try {
      live = await fetchLiveStationBoard(displaysDoc.stationCode, { lookAheadHours: hours });
    } catch (err) {
      return res.status(502).json({
        error: 'ntes_live_unavailable',
        message: err.message || 'Failed to fetch NTES live station board'
      });
    }

    // Prefer NTES station name when config name is missing / generic
    if (live.stationName && (!displaysDoc.stationName || displaysDoc.stationName === displaysDoc.stationCode)) {
      displaysDoc.stationName = live.stationName;
    }

    const result = await buildCoachBoard({
      displaysDoc,
      typesDoc,
      displayId,
      boardTrains: live.trains,
      stationLayout,
      dataSource: 'ntes-live'
    });

    if (result.error) return res.status(result.status || 500).json(result);
    result.body.liveFetchedAt = live.fetchedAt;
    result.body.liveTrainCount = live.trains.length;
    res.set('Cache-Control', 'no-store');
    res.json(result.body);
  });

  async function resolveStationName(code, fallbackName) {
    const ntes = await resolveStationFromNtes(code);
    const fallback = String(fallbackName || '').trim();
    if (ntes.ok) {
      return {
        ok: true,
        stationCode: ntes.stationCode,
        stationName: ntes.stationName || fallback || code,
        trainCount: ntes.trainCount,
        source: ntes.stationName ? 'ntes' : (fallback ? 'manual' : 'code')
      };
    }
    if (fallback) {
      return {
        ok: true,
        stationCode: code,
        stationName: fallback,
        trainCount: 0,
        source: 'manual',
        warning: ntes.error || 'NTES lookup failed'
      };
    }
    return { ok: false, error: ntes.error || `NTES did not return a name for ${code}` };
  }

  router.get('/admin/station-lookup', async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const code = String(req.query.code || req.query.stationCode || '').trim().toUpperCase();
    if (!code || code.length < 2) {
      return res.status(400).json({ error: 'Enter a 2–6 letter station code' });
    }
    const result = await resolveStationName(code);
    if (!result.ok) return res.status(404).json({ error: result.error });
    res.json(result);
  });

  router.get('/admin/displays', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const doc = readJson('coach_displays.json', { displays: [] });
    res.json(doc);
  });

  router.post('/admin/displays', async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const body = req.body || {};
    const doc = readJson('coach_displays.json', {
      stationCode: 'BG',
      bogieLengthMeters: 25,
      showBeforeMinutes: 10,
      hideAfterDepartMinutes: 0,
      languages: ['en', 'te', 'hi'],
      displays: []
    });

    if (body.stationCode) {
      const code = String(body.stationCode).trim().toUpperCase();
      const resolved = await resolveStationName(code, body.stationName);
      if (!resolved.ok) return res.status(400).json({ error: resolved.error });
      doc.stationCode = resolved.stationCode;
      doc.stationName = resolved.stationName;
    }
    if (typeof body.bogieLengthMeters === 'number') doc.bogieLengthMeters = body.bogieLengthMeters;
    if (typeof body.showBeforeMinutes === 'number') doc.showBeforeMinutes = body.showBeforeMinutes;
    if (typeof body.hideAfterDepartMinutes === 'number') {
      doc.hideAfterDepartMinutes = body.hideAfterDepartMinutes;
    }
    if (typeof body.lookAheadHours === 'number') doc.lookAheadHours = body.lookAheadHours;
    if (Array.isArray(body.languages)) doc.languages = body.languages;

    if (!body.display) {
      writeJson('coach_displays.json', doc);
      return res.json({
        ok: true,
        stationCode: doc.stationCode,
        stationName: doc.stationName,
        displays: doc.displays
      });
    }

    const display = body.display;
    if (!display || !display.id) {
      return res.status(400).json({ error: 'display.id required' });
    }

    const id = String(display.id).toLowerCase();
    const next = {
      id,
      name: display.name || id,
      mode: display.mode === 'single' ? 'single' : 'dual',
      platformsShown: (display.platformsShown || []).map(String),
      youAreHere: display.youAreHere || undefined
    };

    const idx = (doc.displays || []).findIndex((d) => d.id === id);
    if (idx >= 0) doc.displays[idx] = { ...doc.displays[idx], ...next };
    else doc.displays.push(next);

    writeJson('coach_displays.json', doc);
    res.json({
      ok: true,
      stationCode: doc.stationCode,
      stationName: doc.stationName,
      displays: doc.displays
    });
  });

  router.get('/admin/sessions', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const sessions = listActive(readSessions());
    res.json({
      activeCount: sessions.length,
      sessions,
      staleAfterSeconds: Math.floor(STALE_MS / 1000)
    });
  });

  router.post('/admin/sessions/stop', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const sessionId = req.body?.sessionId || req.body?.id;
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
    const result = stopSession(readSessions(), String(sessionId));
    writeSessions(result.store);
    if (!result.found) return res.status(404).json({ error: 'Session not found' });
    res.json({ stopped: true, sessionId: String(sessionId) });
  });

  router.post('/admin/sessions/stop-all', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const result = stopAll(readSessions());
    writeSessions(result.store);
    res.json({ stopped: result.count, message: `Stopped ${result.count} session(s)` });
  });

  router.get('/coach-types', (req, res) => {
    res.json(readJson('coach_types.json', {}));
  });

  return router;
}

module.exports = createApiRouter;
