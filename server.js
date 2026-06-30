'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');

const createApiRouter = require('./routes/api');
const { fetchLiveBoard, STATION_CODE } = require('./services/railwayService');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');

const app = express();
app.use(express.json());

let cache = {
  boardTrains: [],
  config: {},
  lastUpdated: null,
  lastError: null
};

let refreshTimer = null;

function getCache() {
  return cache;
}

function loadJson(filename) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, filename), 'utf8'));
}

function saveConfig(config) {
  fs.writeFileSync(
    path.join(DATA_DIR, 'config.json'),
    JSON.stringify(config, null, 2)
  );
}

function writeLiveStatus(boardTrains) {
  fs.writeFileSync(
    path.join(DATA_DIR, 'live_status.json'),
    JSON.stringify({ lastUpdated: cache.lastUpdated, trains: boardTrains }, null, 2)
  );
}

async function refresh() {
  try {
    const config = loadJson('config.json');
    if (config.refreshEnabled === false) {
      console.log('[scheduler] refresh skipped (disabled)');
      return;
    }

    const master = loadJson('trains.json');
    const stationCode = config.stationCode || STATION_CODE;
    const boardTrains = await fetchLiveBoard(stationCode, master, config);

    cache = {
      boardTrains,
      config,
      lastUpdated: new Date().toISOString(),
      lastError: null
    };

    writeLiveStatus(boardTrains);
    console.log(`[NTES] ${stationCode} live board: ${boardTrains.length} trains at ${cache.lastUpdated}`);
  } catch (err) {
    cache.lastError = err.message;
    console.error('[scheduler] Refresh failed:', err.message);
  }
}

function stopRefreshLoop() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  console.log('[scheduler] refresh loop stopped');
}

async function startRefreshLoop() {
  stopRefreshLoop();
  const config = loadJson('config.json');
  cache.config = config;

  if (config.refreshEnabled === false) {
    console.log('[scheduler] refresh disabled in config');
    return;
  }

  await refresh();
  const refreshMs = (config.refreshInterval || 30) * 1000;
  refreshTimer = setInterval(refresh, refreshMs);
  console.log(`[scheduler] refresh loop started (${config.refreshInterval}s)`);
}

app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', createApiRouter({
  getCache,
  startRefresh: startRefreshLoop,
  stopRefresh: stopRefreshLoop,
  saveConfig
}));

startRefreshLoop();

app.listen(PORT, () => {
  const config = loadJson('config.json');
  console.log(`Charlapalli PDS running at http://localhost:${PORT}`);
  console.log(`Data source: NTES Live Station (${config.stationCode})`);
  console.log(`Refresh: ${config.refreshEnabled !== false ? 'enabled' : 'disabled'}`);
});
