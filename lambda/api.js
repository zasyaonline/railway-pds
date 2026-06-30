'use strict';

/**
 * Lambda: get-trains API + refresh start/stop controls
 */

const { getJson, putJson } = require('./lib/s3');
const { setScheduleEnabled } = require('./lib/scheduler');
const { buildDisplayList } = require('./services/mergeService');
const { fetchLiveBoard, STATION_CODE } = require('./services/railwayService');

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
};

function respond(statusCode, body) {
  return { statusCode, headers: CORS_HEADERS, body: JSON.stringify(body) };
}

async function getRefreshStatus(bucket) {
  const config = await getJson(bucket, 'data/config.json');
  return {
    refreshEnabled: config.refreshEnabled !== false,
    refreshInterval: config.refreshInterval || 30
  };
}

async function runImmediateRefresh(bucket, config) {
  const master = await getJson(bucket, 'data/trains.json');
  const stationCode = config.stationCode || STATION_CODE;
  const boardTrains = await fetchLiveBoard(stationCode, master, config);
  const lastUpdated = new Date().toISOString();
  await putJson(bucket, 'data/live_status.json', {
    lastUpdated,
    stationCode,
    trains: boardTrains
  });
  return lastUpdated;
}

async function setRefreshEnabled(bucket, enabled) {
  const config = await getJson(bucket, 'data/config.json');
  config.refreshEnabled = enabled;
  await putJson(bucket, 'data/config.json', config);

  const ruleName = process.env.REFRESH_RULE_NAME;
  if (ruleName) {
    await setScheduleEnabled(ruleName, enabled);
  }

  if (enabled) {
    try {
      await runImmediateRefresh(bucket, config);
    } catch (err) {
      console.warn('[api] immediate refresh failed:', err.message);
    }
  }

  return config;
}

exports.handler = async (event) => {
  const method = event.requestContext?.http?.method || event.httpMethod || 'GET';
  const path = event.requestContext?.http?.path || event.path || '/';

  if (method === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  const bucket = process.env.BUCKET_NAME;
  if (!bucket) {
    return respond(500, { error: 'BUCKET_NAME not configured' });
  }

  try {
    if (path.endsWith('/refresh/status') || path === '/api/refresh/status') {
      const status = await getRefreshStatus(bucket);
      return respond(200, status);
    }

    if (method === 'POST' && (path.endsWith('/refresh/stop') || path === '/api/refresh/stop')) {
      const config = await setRefreshEnabled(bucket, false);
      return respond(200, {
        refreshEnabled: false,
        message: 'Refresh stopped — no NTES fetches until started again'
      });
    }

    if (method === 'POST' && (path.endsWith('/refresh/start') || path === '/api/refresh/start')) {
      const config = await setRefreshEnabled(bucket, true);
      return respond(200, {
        refreshEnabled: true,
        message: 'Refresh started — fetching live data now'
      });
    }

    if (path.endsWith('/health') || path === '/api/health') {
      const live = await getJson(bucket, 'data/live_status.json').catch(() => ({ trains: [] }));
      const config = await getJson(bucket, 'data/config.json');
      const display = buildDisplayList(live.trains || [], config);
      return respond(200, {
        status: 'ok',
        refreshEnabled: config.refreshEnabled !== false,
        boardTrainCount: (live.trains || []).length,
        displayTrainCount: display.length,
        lastUpdated: live.lastUpdated || null
      });
    }

    const config = await getJson(bucket, 'data/config.json');
    const live = await getJson(bucket, 'data/live_status.json');
    const trains = buildDisplayList(live.trains || [], config);

    return respond(200, {
      stationCode: config.stationCode,
      stationName: config.stationName,
      lastUpdated: live.lastUpdated,
      refreshInterval: config.refreshInterval,
      refreshEnabled: config.refreshEnabled !== false,
      source: 'NTES Live Station',
      trains
    });
  } catch (err) {
    console.error('[api] error:', err.message);
    return respond(503, { error: 'Request failed', detail: err.message });
  }
};
