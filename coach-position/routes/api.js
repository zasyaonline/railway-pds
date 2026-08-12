'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const { buildCoachBoard } = require('../services/boardBuilder');

function createApiRouter(deps) {
  const router = express.Router();
  const { dataDir, getBoardTrains, adminKey } = deps;

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
      displayCount: (displays.displays || []).length
    });
  });

  router.get('/coach-board', async (req, res) => {
    const displaysDoc = readJson('coach_displays.json', null);
    const typesDoc = readJson('coach_types.json', { types: {}, codeRules: [] });
    if (!displaysDoc) return res.status(503).json({ error: 'Config missing' });

    const displayId = req.query.display || displaysDoc.displays?.[0]?.id;
    const boardTrains = typeof getBoardTrains === 'function' ? getBoardTrains() : readJson('demo_board.json', []);
    const compositionCache = readJson('composition_cache.json', {});

    const result = await buildCoachBoard({
      displaysDoc,
      typesDoc,
      displayId,
      boardTrains,
      compositionCache,
      useNtes: process.env.COACH_USE_NTES === '1'
    });

    if (result.error) return res.status(result.status || 500).json(result);
    res.set('Cache-Control', 'no-store');
    res.json(result.body);
  });

  router.get('/admin/displays', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const doc = readJson('coach_displays.json', { displays: [] });
    res.json(doc);
  });

  router.post('/admin/displays', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const body = req.body || {};
    const doc = readJson('coach_displays.json', {
      stationCode: 'CHZ',
      bogieLengthMeters: 25,
      showBeforeMinutes: 10,
      hideAfterDepartMinutes: 15,
      languages: ['en', 'te', 'hi'],
      displays: []
    });

    if (body.stationCode) doc.stationCode = String(body.stationCode).toUpperCase();
    if (typeof body.bogieLengthMeters === 'number') doc.bogieLengthMeters = body.bogieLengthMeters;
    if (typeof body.showBeforeMinutes === 'number') doc.showBeforeMinutes = body.showBeforeMinutes;
    if (typeof body.hideAfterDepartMinutes === 'number') {
      doc.hideAfterDepartMinutes = body.hideAfterDepartMinutes;
    }
    if (Array.isArray(body.languages)) doc.languages = body.languages;

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
    res.json({ ok: true, displays: doc.displays });
  });

  router.get('/coach-types', (req, res) => {
    res.json(readJson('coach_types.json', {}));
  });

  return router;
}

module.exports = createApiRouter;
