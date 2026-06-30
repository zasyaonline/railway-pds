'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const { buildDisplayList } = require('../services/mergeService');

function createApiRouter(deps) {
  const router = express.Router();
  const { getCache, startRefresh, stopRefresh, saveConfig } = deps;

  router.get('/trains', (req, res) => {
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
    res.json({
      status: 'ok',
      refreshEnabled: cache.config.refreshEnabled !== false,
      boardTrainCount: cache.boardTrains?.length ?? 0,
      displayTrainCount: buildDisplayList(cache.boardTrains || [], cache.config || {}).length,
      lastUpdated: cache.lastUpdated
    });
  });

  return router;
}

module.exports = createApiRouter;
