'use strict';

/**
 * Coach Position poller — NTES once per station, write S3 board.json.
 * Runs inside railway-pds-CHZ-refresh after the PDS CHZ write.
 */

const { getJson, putJson } = require('./lib/s3');

function loadStationStore() {
  try {
    return require('./coach-services/stationStore');
  } catch {
    return require('../coach-position/services/stationStore');
  }
}

function loadCoachServices() {
  try {
    return {
      fetchLiveStationBoard: require('./coach-services/liveBoardService').fetchLiveStationBoard,
      buildCoachBoard: require('./coach-services/boardBuilder').buildCoachBoard
    };
  } catch {
    return {
      fetchLiveStationBoard: require('../coach-position/services/liveBoardService').fetchLiveStationBoard,
      buildCoachBoard: require('../coach-position/services/boardBuilder').buildCoachBoard
    };
  }
}

function isS3AccessError(err) {
  const msg = String(err && (err.message || err.name) || '');
  return /not authorized|AccessDenied|ExplicitDeny|Access Denied/i.test(msg);
}

async function loadDisplays(bucket, store, code) {
  const rel = store.stationRel(code);
  try {
    return await getJson(bucket, store.s3Key(rel.displays));
  } catch (err) {
    if (isS3AccessError(err)) throw err;
    if (rel.code === store.DEFAULT_STATION) {
      try {
        return await getJson(bucket, store.s3Key(store.LEGACY_DISPLAYS));
      } catch (err2) {
        if (isS3AccessError(err2)) throw err2;
      }
    }
    return store.emptyDisplaysDoc(rel.code);
  }
}

async function loadLayout(bucket, store, code) {
  const rel = store.stationRel(code);
  try {
    return await getJson(bucket, store.s3Key(rel.layout));
  } catch {
    try {
      return await getJson(bucket, store.s3Key('station_layout.json'));
    } catch {
      return null;
    }
  }
}

async function refreshOneStation(bucket, store, services, typesDoc, code) {
  const rel = store.stationRel(code);
  let displaysDoc = store.withDefaultDisplay(await loadDisplays(bucket, store, rel.code));
  displaysDoc.stationCode = rel.code;
  const hours = displaysDoc.lookAheadHours || 4;
  const live = await services.fetchLiveStationBoard(rel.code, { lookAheadHours: hours });
  if (live.stationName) displaysDoc.stationName = live.stationName;

  const result = await services.buildCoachBoard({
    displaysDoc,
    typesDoc,
    displayId: displaysDoc.displays[0].id,
    boardTrains: live.trains,
    stationLayout: await loadLayout(bucket, store, rel.code),
    dataSource: 'ntes-live'
  });
  if (result.error) throw new Error(result.error);

  result.body.liveFetchedAt = live.fetchedAt;
  result.body.liveTrainCount = live.trains.length;

  const cacheControl = 'public, max-age=30';
  await putJson(bucket, store.s3Key(rel.board), result.body, { cacheControl });
  if (rel.code === store.DEFAULT_STATION) {
    await putJson(bucket, store.s3Key(store.LEGACY_BOARD), result.body, { cacheControl });
    await putJson(bucket, store.s3Key(store.LEGACY_DISPLAYS), displaysDoc, {
      cacheControl: 'public, max-age=60'
    });
  }

  return {
    station: rel.code,
    trains: live.trains.length,
    focus: result.body.focus?.train?.trainNo || null,
    coaches: result.body.focus?.coachCount || 0
  };
}

/**
 * Refresh a shard of stations from station_index.json.
 * Shard when the roster is large so a 5-minute Lambda can finish.
 */
async function refreshCoachStations() {
  const bucket = process.env.COACH_BUCKET;
  if (!bucket) {
    console.log('[coach-refresh] skipped — COACH_BUCKET not set');
    return { skipped: true, reason: 'COACH_BUCKET not set' };
  }

  let store;
  let services;
  try {
    store = loadStationStore();
    services = loadCoachServices();
  } catch (err) {
    console.error('[coach-refresh] services missing:', err.message);
    return { skipped: true, reason: err.message };
  }

  let index;
  try {
    index = await getJson(bucket, store.s3Key(store.INDEX_REL));
  } catch {
    index = { stations: [store.DEFAULT_STATION] };
  }

  const all = (index.stations || []).map((s) => String(s).toUpperCase()).filter(Boolean);
  if (!all.length) all.push(store.DEFAULT_STATION);

  const shardMod = all.length > 10 ? Number(process.env.COACH_SHARD_MOD || 3) : 1;
  const shard = new Date().getMinutes() % shardMod;
  const codes = all.filter((_, i) => i % shardMod === shard);

  let typesDoc;
  try {
    typesDoc = await getJson(bucket, store.s3Key(store.TYPES_REL));
  } catch (err) {
    return { skipped: true, reason: `coach_types.json: ${err.message}` };
  }

  const results = [];
  for (const code of codes) {
    try {
      const row = await refreshOneStation(bucket, store, services, typesDoc, code);
      results.push({ ok: true, ...row });
      console.log(`[coach-refresh] ${row.station}: ${row.trains} trains focus=${row.focus || 'none'}`);
    } catch (err) {
      console.error(`[coach-refresh] ${code}:`, err.message);
      results.push({ ok: false, station: code, error: err.message });
    }
  }

  return { shard, shardMod, count: codes.length, results };
}

module.exports = { refreshCoachStations };
