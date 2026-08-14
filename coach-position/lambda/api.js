'use strict';

const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { buildCoachBoard } = require('./services/boardBuilder');
const { fetchLiveStationBoard } = require('./services/liveBoardService');
function loadSessionService() {
  try {
    return require('../../services/sessionService');
  } catch {
    return require('./parent-services/sessionService');
  }
}
function loadNtesClient() {
  try {
    return require('../../services/ntesClient');
  } catch {
    return require('./parent-services/ntesClient');
  }
}
const {
  SESSIONS_KEY,
  STALE_MS,
  emptyStore,
  touchSession,
  listActive,
  stopSession,
  stopAll
} = loadSessionService();
const { resolveStationFromNtes } = loadNtesClient();

const s3 = new S3Client({});
const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key, X-Session-Id',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Cache-Control': 'no-store'
};

async function getJson(bucket, key) {
  const out = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const text = await out.Body.transformToString();
  return JSON.parse(text);
}

async function putJson(bucket, key, doc) {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(doc, null, 2),
      ContentType: 'application/json'
    })
  );
}

function respond(code, body) {
  return { statusCode: code, headers: CORS, body: JSON.stringify(body) };
}

function header(event, name) {
  const headers = event.headers || {};
  const want = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === want) return v;
  }
  return '';
}

function requireAdmin(event) {
  const expected = process.env.ADMIN_KEY || 'coach-ops';
  const qs = event.queryStringParameters || {};
  const provided = header(event, 'x-admin-key') || qs.adminKey || qs.key || '';
  return Boolean(provided && provided === expected);
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

async function registerViewer(bucket, event) {
  const qs = event.queryStringParameters || {};
  const sessionId =
    header(event, 'x-session-id') ||
    qs.sessionId ||
    qs.sid;
  if (!sessionId) return { ok: true };

  const store = await loadSessions(bucket);
  const result = touchSession(store, {
    id: String(sessionId),
    userAgent: header(event, 'user-agent')
  });
  await saveSessions(bucket, result.store);
  if (result.killed) return { ok: false, killed: true };
  return { ok: true, session: result.session };
}

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

exports.handler = async (event) => {
  const method = event.requestContext?.http?.method || event.httpMethod || 'GET';
  const path = event.requestContext?.http?.path || event.path || '/';
  if (method === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };

  const bucket = process.env.BUCKET_NAME;
  if (!bucket) return respond(500, { error: 'BUCKET_NAME missing' });

  try {
    if (path.endsWith('/health') || path === '/api/health') {
      const displays = await getJson(bucket, 'data/coach_displays.json').catch(() => ({ displays: [] }));
      return respond(200, {
        status: 'ok',
        app: 'coach-position',
        stationCode: displays.stationCode || null,
        displayCount: (displays.displays || []).length,
        activeSessions: listActive(await loadSessions(bucket).catch(() => emptyStore())).length
      });
    }

    if (path.includes('/coach-types')) {
      const types = await getJson(bucket, 'data/coach_types.json');
      return respond(200, types);
    }

    if (method === 'GET' && path.includes('/admin/station-lookup')) {
      if (!requireAdmin(event)) return respond(401, { error: 'Admin key required' });
      const qs = event.queryStringParameters || {};
      const code = String(qs.code || qs.stationCode || '').trim().toUpperCase();
      if (!code || code.length < 2) {
        return respond(400, { error: 'Enter a 2–6 letter station code' });
      }
      const result = await resolveStationName(code);
      if (!result.ok) return respond(404, { error: result.error });
      return respond(200, result);
    }

    if (method === 'GET' && path.includes('/admin/displays')) {
      if (!requireAdmin(event)) return respond(401, { error: 'Admin key required' });
      const doc = await getJson(bucket, 'data/coach_displays.json');
      return respond(200, doc);
    }

    if (method === 'POST' && path.includes('/admin/displays')) {
      if (!requireAdmin(event)) return respond(401, { error: 'Admin key required' });
      const body = parseBody(event);
      const doc = await getJson(bucket, 'data/coach_displays.json');
      if (body.stationCode) {
        const code = String(body.stationCode).trim().toUpperCase();
        const resolved = await resolveStationName(code, body.stationName);
        if (!resolved.ok) return respond(400, { error: resolved.error });
        doc.stationCode = resolved.stationCode;
        doc.stationName = resolved.stationName;
      }
      if (!body.display) {
        await putJson(bucket, 'data/coach_displays.json', doc);
        return respond(200, {
          ok: true,
          stationCode: doc.stationCode,
          stationName: doc.stationName,
          displays: doc.displays
        });
      }
      const display = body.display;
      if (!display?.id) return respond(400, { error: 'display.id required' });
      const id = String(display.id).toLowerCase();
      const next = {
        id,
        name: display.name || id,
        mode: display.mode === 'single' ? 'single' : 'dual',
        platformsShown: (display.platformsShown || []).map(String),
        youAreHere: display.youAreHere
      };
      const idx = (doc.displays || []).findIndex((d) => d.id === id);
      if (idx >= 0) doc.displays[idx] = { ...doc.displays[idx], ...next };
      else {
        doc.displays = doc.displays || [];
        doc.displays.push(next);
      }
      await putJson(bucket, 'data/coach_displays.json', doc);
      return respond(200, {
        ok: true,
        stationCode: doc.stationCode,
        stationName: doc.stationName,
        displays: doc.displays
      });
    }

    if (method === 'GET' && path.includes('/admin/sessions')) {
      if (!requireAdmin(event)) return respond(401, { error: 'Admin key required' });
      const store = await loadSessions(bucket);
      const sessions = listActive(store);
      return respond(200, {
        activeCount: sessions.length,
        sessions,
        staleAfterSeconds: Math.floor(STALE_MS / 1000)
      });
    }

    if (method === 'POST' && path.includes('/admin/sessions/stop-all')) {
      if (!requireAdmin(event)) return respond(401, { error: 'Admin key required' });
      const store = await loadSessions(bucket);
      const result = stopAll(store);
      await saveSessions(bucket, result.store);
      return respond(200, { stopped: result.count, message: `Stopped ${result.count} session(s)` });
    }

    if (method === 'POST' && path.includes('/admin/sessions/stop')) {
      if (!requireAdmin(event)) return respond(401, { error: 'Admin key required' });
      const body = parseBody(event);
      const sessionId = body.sessionId || body.id;
      if (!sessionId) return respond(400, { error: 'sessionId required' });
      const store = await loadSessions(bucket);
      const result = stopSession(store, String(sessionId));
      await saveSessions(bucket, result.store);
      if (!result.found) return respond(404, { error: 'Session not found' });
      return respond(200, { stopped: true, sessionId: String(sessionId) });
    }

    // Default coach board — live NTES halts only
    const viewer = await registerViewer(bucket, event);
    if (viewer.killed) {
      return respond(409, {
        error: 'session_stopped',
        message: 'This display session was stopped by an administrator'
      });
    }
    const qs = event.queryStringParameters || {};
    const displaysDoc = await getJson(bucket, 'data/coach_displays.json');
    const typesDoc = await getJson(bucket, 'data/coach_types.json');
    const stationLayout = await getJson(bucket, 'data/station_layout.json').catch(() => null);
    const hours = displaysDoc.lookAheadHours || 4;
    let live;
    try {
      live = await fetchLiveStationBoard(displaysDoc.stationCode, { lookAheadHours: hours });
    } catch (err) {
      return respond(502, { error: 'ntes_live_unavailable', message: err.message });
    }
    if (live.stationName) displaysDoc.stationName = live.stationName;
    const result = await buildCoachBoard({
      displaysDoc,
      typesDoc,
      displayId: qs.display || displaysDoc.displays?.[0]?.id,
      boardTrains: live.trains,
      stationLayout,
      dataSource: 'ntes-live'
    });
    if (result.error) return respond(result.status || 500, result);
    result.body.liveFetchedAt = live.fetchedAt;
    result.body.liveTrainCount = live.trains.length;
    return respond(200, result.body);
  } catch (err) {
    console.error(err);
    return respond(503, { error: err.message });
  }
};
