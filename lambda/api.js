'use strict';

/**
 * Lambda: get-trains API + refresh + sessions + station + platform overrides
 */

const { getJson, putJson } = require('./lib/s3');
const { setScheduleEnabled } = require('./lib/scheduler');
const { buildDisplayList } = require('./services/mergeService');
const { fetchLiveBoard, STATION_CODE } = require('./services/railwayService');
const { resolveStationFromNtes } = require('./services/ntesClient');
const {
  SESSIONS_KEY,
  STALE_MS,
  emptyStore,
  touchSession,
  listActive,
  stopSession,
  stopAll
} = require('./services/sessionService');
const {
  presetsFromMaster,
  resolveStationInput,
  findPreset,
  normalizeStationCode,
  stationsByName
} = require('./services/stationCatalog');
const {
  OVERRIDES_KEY,
  emptyOverrides,
  applyPlatformOverrides,
  pruneOverrides,
  setOverride,
  clearOverride,
  clearAllOverrides
} = require('./services/platformOverrides');

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

async function loadOverrides(bucket) {
  try {
    return await getJson(bucket, OVERRIDES_KEY);
  } catch {
    return emptyOverrides();
  }
}

async function saveOverrides(bucket, doc) {
  await putJson(bucket, OVERRIDES_KEY, doc);
}

async function loadStations(bucket) {
  try {
    return await getJson(bucket, 'data/stations.json');
  } catch {
    return {};
  }
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

function stationLocales(stationsMaster, code, englishName) {
  const row = findPreset(code, stationsMaster);
  return {
    en: row?.en || englishName || code,
    te: row?.te || null,
    hi: row?.hi || null
  };
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
      const overrides = await loadOverrides(bucket);
      const display = buildDisplayList(live.trains || [], config, overrides);
      const sessions = listActive(await loadSessions(bucket));
      return respond(200, {
        status: 'ok',
        refreshEnabled: config.refreshEnabled !== false,
        boardTrainCount: (live.trains || []).length,
        displayTrainCount: display.length,
        activeSessions: sessions.length,
        lastUpdated: live.lastUpdated || null,
        stationCode: config.stationCode,
        stationName: config.stationName
      });
    }

    if (method === 'GET' && (path.endsWith('/admin/sessions') || path === '/api/admin/sessions')) {
      if (!requireAdmin(event)) {
        return respond(401, { error: 'Admin key required' });
      }
      const store = await loadSessions(bucket);
      const sessions = listActive(store);
      const refresh = await getRefreshStatus(bucket);
      const config = await getJson(bucket, 'data/config.json');
      const stations = await loadStations(bucket);
      return respond(200, {
        activeCount: sessions.length,
        sessions,
        refreshEnabled: refresh.refreshEnabled,
        refreshInterval: refresh.refreshInterval,
        staleAfterSeconds: Math.floor(STALE_MS / 1000),
        stationCode: config.stationCode || 'CHZ',
        stationName: config.stationName || 'Charlapalli',
        stationPresets: presetsFromMaster(stations),
        stationNames: stationLocales(stations, config.stationCode, config.stationName)
      });
    }

    if (method === 'POST' && (path.endsWith('/admin/station') || path === '/api/admin/station')) {
      if (!requireAdmin(event)) {
        return respond(401, { error: 'Admin key required' });
      }
      const body = parseBody(event);
      const code = normalizeStationCode(body.stationCode);
      const ntes = await resolveStationFromNtes(code);
      if (!ntes.ok) {
        return respond(400, { error: ntes.error || 'Invalid station code' });
      }

      const stations = await loadStations(bucket);
      const master = findPreset(code, stations);
      const englishName = ntes.stationName || master?.en || null;
      if (!englishName) {
        return respond(400, {
          error: 'Station code not recognized by NTES (no English name returned)'
        });
      }
      const resolved = resolveStationInput({
        stationCode: code,
        ntesName: englishName
      });
      if (!resolved.ok) {
        return respond(400, { error: resolved.error });
      }

      const config = await getJson(bucket, 'data/config.json');
      config.stationCode = resolved.stationCode;
      config.stationName = resolved.stationName;
      await putJson(bucket, 'data/config.json', config);

      let refresh = null;
      try {
        if (config.refreshEnabled !== false) {
          const lastUpdated = await runImmediateRefresh(bucket, config);
          refresh = { ok: true, lastUpdated };
        } else {
          refresh = { ok: false, reason: 'refresh disabled' };
        }
      } catch (err) {
        console.warn('[api] station change refresh failed:', err.message);
        refresh = { ok: false, reason: err.message };
      }

      return respond(200, {
        stationCode: config.stationCode,
        stationName: config.stationName,
        stationNames: stationLocales(stations, config.stationCode, config.stationName),
        ntesTrainCount: ntes.trainCount,
        message: `Station set to ${config.stationName} (${config.stationCode})`,
        refresh
      });
    }

    if (method === 'GET' && (path.endsWith('/admin/platforms') || path === '/api/admin/platforms')) {
      if (!requireAdmin(event)) {
        return respond(401, { error: 'Admin key required' });
      }
      const config = await getJson(bucket, 'data/config.json');
      const live = await getJson(bucket, 'data/live_status.json').catch(() => ({ trains: [] }));
      let overrides = await loadOverrides(bucket);
      const display = buildDisplayList(live.trains || [], config, overrides);
      const pruned = pruneOverrides(overrides, display.map((t) => t.trainNo));
      if (Object.keys(pruned.overrides).length !== Object.keys(overrides.overrides || {}).length) {
        await saveOverrides(bucket, pruned);
        overrides = pruned;
      }
      return respond(200, {
        stationCode: config.stationCode,
        trains: display.map((t) => ({
          trainNo: t.trainNo,
          trainName: t.trainName,
          ntesPlatform: t.ntesPlatform || t.platform,
          platform: t.platform,
          platformOverridden: Boolean(t.platformOverridden),
          status: t.status
        })),
        overrides: overrides.overrides || {}
      });
    }

    if (method === 'POST' && (path.endsWith('/admin/platforms/clear') || path === '/api/admin/platforms/clear')) {
      if (!requireAdmin(event)) {
        return respond(401, { error: 'Admin key required' });
      }
      const body = parseBody(event);
      let doc;
      if (body.all) {
        doc = clearAllOverrides().doc;
      } else {
        const current = await loadOverrides(bucket);
        const result = clearOverride(current, body.trainNo);
        if (!result.ok) return respond(400, { error: result.error });
        doc = result.doc;
      }
      await saveOverrides(bucket, doc);
      return respond(200, { ok: true, overrides: doc.overrides });
    }

    if (method === 'POST' && (path.endsWith('/admin/platforms') || path === '/api/admin/platforms')) {
      if (!requireAdmin(event)) {
        return respond(401, { error: 'Admin key required' });
      }
      const body = parseBody(event);
      const current = await loadOverrides(bucket);
      const result = setOverride(current, body.trainNo, body.platform, body.note);
      if (!result.ok) return respond(400, { error: result.error });
      await saveOverrides(bucket, result.doc);
      return respond(200, {
        ok: true,
        trainNo: result.trainNo,
        override: result.override,
        overrides: result.doc.overrides
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

    if (method === 'GET' && (path.includes('/station-lookup') || path.endsWith('/station-lookup'))) {
      const qs = event.queryStringParameters || {};
      const code = String(qs.code || qs.stationCode || '').trim().toUpperCase();
      if (!code || code.length < 2) {
        return respond(400, { error: 'Enter a 2–6 letter station code' });
      }
      const ntes = await resolveStationFromNtes(code);
      if (!ntes.ok) {
        return respond(404, { error: ntes.error || `NTES did not return a name for ${code}` });
      }
      return respond(200, {
        ok: true,
        stationCode: ntes.stationCode,
        stationName: ntes.stationName || code,
        trainCount: ntes.trainCount,
        source: 'ntes'
      });
    }

    // Default: trains board
    const viewer = await registerViewer(bucket, event);
    if (viewer.killed) {
      return respond(409, {
        error: 'session_stopped',
        message: 'This display session was stopped by an administrator'
      });
    }

    const config = await getJson(bucket, 'data/config.json');
    const live = await getJson(bucket, 'data/live_status.json');
    let overrides = await loadOverrides(bucket);
    const trains = buildDisplayList(live.trains || [], config, overrides);
    const pruned = pruneOverrides(overrides, trains.map((t) => t.trainNo));
    if (Object.keys(pruned.overrides).length !== Object.keys(overrides.overrides || {}).length) {
      await saveOverrides(bucket, pruned);
      overrides = pruned;
    }

    const stations = await loadStations(bucket);
    return respond(200, {
      stationCode: config.stationCode,
      stationName: config.stationName,
      stationNames: stationLocales(stations, config.stationCode, config.stationName),
      stationsByName: stationsByName(stations),
      lastUpdated: live.lastUpdated,
      refreshInterval: config.refreshInterval,
      refreshEnabled: config.refreshEnabled !== false,
      pageSize: config.pageSize ?? 6,
      pageIntervalSeconds: config.pageIntervalSeconds ?? 10,
      languageRotateSeconds: config.languageRotateSeconds ?? 10,
      languages: config.languages || ['en', 'te', 'hi'],
      source: 'NTES Live Station',
      trains
    });
  } catch (err) {
    console.error('[api] error:', err.message);
    return respond(503, { error: 'Request failed', detail: err.message });
  }
};
