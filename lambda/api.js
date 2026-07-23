'use strict';

/**
 * Lambda: get-trains API + refresh start/stop + viewer sessions admin
 */

const { getJson, putJson } = require('./lib/s3');
const { setScheduleEnabled } = require('./lib/scheduler');
const { buildDisplayList } = require('./services/mergeService');
const { fetchLiveBoard, STATION_CODE } = require('./services/railwayService');
const {
  SESSIONS_KEY,
  STALE_MS,
  emptyStore,
  touchSession,
  listActive,
  stopSession,
  stopAll
} = require('./services/sessionService');

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-Session-Id, X-Admin-Key',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
};

function respond(statusCode, body) {
  return {
    statusCode,
    headers: {
      ...CORS_HEADERS,
      'Cache-Control': 'no-store, max-age=0'
    },
    body: JSON.stringify(body)
  };
}

function header(event, name) {
  const headers = event.headers || {};
  const want = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === want) return value;
  }
  return '';
}

function parseBody(event) {
  if (!event.body) return {};
  try {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : event.body;
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function requireAdmin(event) {
  const expected = process.env.ADMIN_KEY || 'chz-ops';
  const fromHeader = header(event, 'x-admin-key') || '';
  const qs = event.queryStringParameters || {};
  const fromQuery = qs.adminKey || qs.key || '';
  const provided = fromHeader || fromQuery;
  return Boolean(provided && provided === expected);
}

async function loadSessions(bucket) {
  try {
    return await getJson(bucket, SESSIONS_KEY);
  } catch {
    return emptyStore();
  }
}

async function saveSessions(bucket, store) {
  await putJson(bucket, SESSIONS_KEY, store);
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

async function registerViewer(bucket, event) {
  const qs = event.queryStringParameters || {};
  const sessionId =
    header(event, 'x-session-id') ||
    qs.sessionId ||
    qs.sid ||
    parseBody(event).sessionId;
  if (!sessionId) {
    return { ok: true };
  }

  const store = await loadSessions(bucket);
  const result = touchSession(store, {
    id: String(sessionId),
    userAgent: header(event, 'user-agent')
  });
  await saveSessions(bucket, result.store);

  if (result.killed) {
    return { ok: false, killed: true };
  }
  return { ok: true, session: result.session };
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
      await setRefreshEnabled(bucket, false);
      return respond(200, {
        refreshEnabled: false,
        message: 'Refresh stopped — no NTES fetches until started again'
      });
    }

    if (method === 'POST' && (path.endsWith('/refresh/start') || path === '/api/refresh/start')) {
      await setRefreshEnabled(bucket, true);
      return respond(200, {
        refreshEnabled: true,
        message: 'Refresh started — fetching live data now'
      });
    }

    if (path.endsWith('/health') || path === '/api/health') {
      const live = await getJson(bucket, 'data/live_status.json').catch(() => ({ trains: [] }));
      const config = await getJson(bucket, 'data/config.json');
      const display = buildDisplayList(live.trains || [], config);
      const sessions = listActive(await loadSessions(bucket));
      return respond(200, {
        status: 'ok',
        refreshEnabled: config.refreshEnabled !== false,
        boardTrainCount: (live.trains || []).length,
        displayTrainCount: display.length,
        activeSessions: sessions.length,
        lastUpdated: live.lastUpdated || null
      });
    }

    if (method === 'GET' && (path.endsWith('/admin/sessions') || path === '/api/admin/sessions')) {
      if (!requireAdmin(event)) {
        return respond(401, { error: 'Admin key required' });
      }
      const store = await loadSessions(bucket);
      const sessions = listActive(store);
      const refresh = await getRefreshStatus(bucket);
      return respond(200, {
        activeCount: sessions.length,
        sessions,
        refreshEnabled: refresh.refreshEnabled,
        refreshInterval: refresh.refreshInterval,
        staleAfterSeconds: Math.floor(STALE_MS / 1000)
      });
    }

    if (method === 'POST' && (path.endsWith('/admin/sessions/stop-all') || path === '/api/admin/sessions/stop-all')) {
      if (!requireAdmin(event)) {
        return respond(401, { error: 'Admin key required' });
      }
      const store = await loadSessions(bucket);
      const result = stopAll(store);
      await saveSessions(bucket, result.store);
      return respond(200, { stopped: result.count, message: `Stopped ${result.count} session(s)` });
    }

    if (method === 'POST' && (path.endsWith('/admin/sessions/stop') || path === '/api/admin/sessions/stop')) {
      if (!requireAdmin(event)) {
        return respond(401, { error: 'Admin key required' });
      }
      const body = parseBody(event);
      const sessionId = body.sessionId || body.id;
      if (!sessionId) {
        return respond(400, { error: 'sessionId required' });
      }
      const store = await loadSessions(bucket);
      const result = stopSession(store, String(sessionId));
      await saveSessions(bucket, result.store);
      if (!result.found) {
        return respond(404, { error: 'Session not found' });
      }
      return respond(200, { stopped: true, sessionId: String(sessionId) });
    }

    // Default: trains board (also registers viewer heartbeat via X-Session-Id)
    const viewer = await registerViewer(bucket, event);
    if (viewer.killed) {
      return respond(409, {
        error: 'session_stopped',
        message: 'This display session was stopped by an administrator'
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
