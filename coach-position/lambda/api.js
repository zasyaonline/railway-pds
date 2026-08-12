'use strict';

const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { buildCoachBoard } = require('./services/boardBuilder');

const s3 = new S3Client({});
const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key',
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
        displayCount: (displays.displays || []).length
      });
    }

    if (path.includes('/coach-types')) {
      const types = await getJson(bucket, 'data/coach_types.json');
      return respond(200, types);
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
      return respond(200, { ok: true, displays: doc.displays });
    }

    // Default coach board
    const qs = event.queryStringParameters || {};
    const displaysDoc = await getJson(bucket, 'data/coach_displays.json');
    const typesDoc = await getJson(bucket, 'data/coach_types.json');
    const boardTrains = await getJson(bucket, 'data/demo_board.json').catch(() => []);
    const compositionCache = await getJson(bucket, 'data/composition_cache.json').catch(() => ({}));
    const result = await buildCoachBoard({
      displaysDoc,
      typesDoc,
      displayId: qs.display || displaysDoc.displays?.[0]?.id,
      boardTrains,
      compositionCache,
      useNtes: process.env.COACH_USE_NTES === '1'
    });
    if (result.error) return respond(result.status || 500, result);
    return respond(200, result.body);
  } catch (err) {
    console.error(err);
    return respond(503, { error: err.message });
  }
};
