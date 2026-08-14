#!/usr/bin/env node
'use strict';

/**
 * Refresh coach_board_cache.json from NTES Live Station for the configured station.
 * Usage: node scripts/refresh-live-cache.js
 * Optional: COACH_DISPLAY=entrance-main LOOKAHEAD_HOURS=4
 */

const fs = require('fs');
const path = require('path');
const { fetchLiveStationBoard } = require('../services/liveBoardService');
const { buildCoachBoard } = require('../services/boardBuilder');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(DATA, name), 'utf8'));
}

async function main() {
  const displaysDoc = readJson('coach_displays.json');
  const typesDoc = readJson('coach_types.json');
  const stationLayout = readJson('station_layout.json');
  const displayId = process.env.COACH_DISPLAY || displaysDoc.displays?.[0]?.id || 'entrance-main';
  const hours = Number(process.env.LOOKAHEAD_HOURS || displaysDoc.lookAheadHours || 4);

  console.log(`Fetching NTES live board for ${displaysDoc.stationCode} (nHr=${hours})…`);
  const live = await fetchLiveStationBoard(displaysDoc.stationCode, { lookAheadHours: hours });
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
    stationLayout,
    dataSource: 'ntes-live'
  });
  if (result.error) {
    console.error(result);
    process.exit(1);
  }

  result.body.liveFetchedAt = live.fetchedAt;
  result.body.liveTrainCount = live.trains.length;
  const out = path.join(DATA, 'coach_board_cache.json');
  fs.writeFileSync(out, JSON.stringify(result.body, null, 2) + '\n');
  console.log(`Wrote ${out}`);
  console.log(
    `Focus: ${result.body.focus?.train?.trainNo || 'none'} coaches=${result.body.focus?.coachCount || 0} divyangjan=${(result.body.focus?.divyangjanPositions || []).join(',') || '—'}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
