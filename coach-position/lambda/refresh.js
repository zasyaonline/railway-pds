'use strict';

/**
 * Refresh — writes live NTES station board + coach composition into S3 cache.
 * Requires network access to enquiry.indianrail.gov.in.
 */

const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');

const s3 = new S3Client({});

async function getJson(bucket, key) {
  const out = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return JSON.parse(await out.Body.transformToString());
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

exports.handler = async () => {
  const bucket = process.env.BUCKET_NAME;
  if (!bucket) throw new Error('BUCKET_NAME missing');

  // Prefer packaged services when Lambda build copies them next to handler
  let fetchLiveStationBoard;
  let buildCoachBoard;
  try {
    ({ fetchLiveStationBoard } = require('./services/liveBoardService'));
    ({ buildCoachBoard } = require('./services/boardBuilder'));
  } catch {
    ({ fetchLiveStationBoard } = require('../services/liveBoardService'));
    ({ buildCoachBoard } = require('../services/boardBuilder'));
  }

  const displaysDoc = await getJson(bucket, 'data/coach_displays.json');
  const typesDoc = await getJson(bucket, 'data/coach_types.json');
  const stationLayout = await getJson(bucket, 'data/station_layout.json').catch(() => null);
  const hours = displaysDoc.lookAheadHours || 4;

  const live = await fetchLiveStationBoard(displaysDoc.stationCode, { lookAheadHours: hours });
  if (live.stationName) displaysDoc.stationName = live.stationName;

  const result = await buildCoachBoard({
    displaysDoc,
    typesDoc,
    displayId: displaysDoc.displays?.[0]?.id || 'entrance-main',
    boardTrains: live.trains,
    stationLayout,
    dataSource: 'ntes-live'
  });
  if (result.error) throw new Error(JSON.stringify(result));

  result.body.liveFetchedAt = live.fetchedAt;
  result.body.liveTrainCount = live.trains.length;

  await putJson(bucket, 'data/coach_board_cache.json', result.body);
  await putJson(bucket, 'data/coach_displays.json', displaysDoc);

  return {
    ok: true,
    station: displaysDoc.stationCode,
    trains: live.trains.length,
    focus: result.body.focus?.train?.trainNo || null,
    coaches: result.body.focus?.coachCount || 0
  };
};
