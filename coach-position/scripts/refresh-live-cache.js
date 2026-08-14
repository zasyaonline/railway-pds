#!/usr/bin/env node
'use strict';

/**
 * Refresh per-station board.json from NTES Live Station.
 * Usage: node scripts/refresh-live-cache.js
 * Optional: COACH_STATION=BG COACH_DISPLAY=entrance-main LOOKAHEAD_HOURS=4
 */

const fs = require('fs');
const path = require('path');
const { fetchLiveStationBoard } = require('../services/liveBoardService');
const { buildCoachBoard } = require('../services/boardBuilder');
const {
  DEFAULT_STATION,
  INDEX_REL,
  LEGACY_DISPLAYS,
  LEGACY_BOARD,
  TYPES_REL,
  normalizeStation,
  stationRel,
  emptyDisplaysDoc,
  withDefaultDisplay,
  upsertIndex
} = require('../services/stationStore');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');

function readJson(rel, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA, rel), 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(rel, doc) {
  const full = path.join(DATA, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify(doc, null, 2) + '\n');
}

function loadDisplays(code) {
  const rel = stationRel(code);
  return (
    readJson(rel.displays, null) ||
    (rel.code === DEFAULT_STATION ? readJson(LEGACY_DISPLAYS, null) : null) ||
    emptyDisplaysDoc(rel.code)
  );
}

function loadLayout(code) {
  const rel = stationRel(code);
  return readJson(rel.layout, null) || readJson('station_layout.json', null);
}

async function refreshStation(code) {
  const rel = stationRel(code);
  const displaysDoc = withDefaultDisplay(loadDisplays(rel.code));
  displaysDoc.stationCode = rel.code;
  const typesDoc = readJson(TYPES_REL, { types: {}, codeRules: [] });
  const displayId =
    process.env.COACH_DISPLAY || displaysDoc.displays[0].id || 'entrance-main';
  const hours = Number(process.env.LOOKAHEAD_HOURS || displaysDoc.lookAheadHours || 4);

  console.log(`Fetching NTES live board for ${rel.code} (nHr=${hours})…`);
  const live = await fetchLiveStationBoard(rel.code, { lookAheadHours: hours });
  console.log(`Halting trains: ${live.trains.length}`);
  for (const t of live.trains.slice(0, 12)) {
    console.log(
      `  ${t.trainNo} ${t.trainName} PF${t.platform} ${t.expectedArrival || '—'}→${t.expectedDeparture || '—'} coaches=${t.coachCodes.length} pwd=${t.pwdPositions.join(',') || '—'}`
    );
  }

  if (live.stationName) displaysDoc.stationName = live.stationName;

  const result = await buildCoachBoard({
    displaysDoc,
    typesDoc,
    displayId,
    boardTrains: live.trains,
    stationLayout: loadLayout(rel.code),
    dataSource: 'ntes-live'
  });
  if (result.error) {
    console.error(result);
    return { ok: false, station: rel.code, error: result.error };
  }

  result.body.liveFetchedAt = live.fetchedAt;
  result.body.liveTrainCount = live.trains.length;
  writeJson(rel.board, result.body);
  writeJson(rel.displays, displaysDoc);
  if (rel.code === DEFAULT_STATION) {
    writeJson(LEGACY_BOARD, result.body);
    writeJson(LEGACY_DISPLAYS, displaysDoc);
  }
  const index = readJson(INDEX_REL, { stations: [] });
  writeJson(INDEX_REL, upsertIndex(index, rel.code));

  console.log(`Wrote data/${rel.board}`);
  console.log(
    `Focus: ${result.body.focus?.train?.trainNo || 'none'} coaches=${result.body.focus?.coachCount || 0}`
  );
  return { ok: true, station: rel.code, trains: live.trains.length };
}

async function main() {
  const only = process.env.COACH_STATION ? normalizeStation(process.env.COACH_STATION) : null;
  const index = readJson(INDEX_REL, { stations: [DEFAULT_STATION] });
  const codes = only
    ? [only]
    : (index.stations || []).map(normalizeStation).filter(Boolean);
  if (!codes.length) codes.push(DEFAULT_STATION);

  let failed = 0;
  for (const code of codes) {
    const row = await refreshStation(code);
    if (!row.ok) failed += 1;
  }
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
