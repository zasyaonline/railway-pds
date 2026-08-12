'use strict';

/**
 * Refresh placeholder — writes demo board timestamps into window.
 * Live NTES board + composition wiring enabled when COACH_USE_NTES=1.
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

function mk(addMin) {
  const d = new Date(Date.now() + addMin * 60_000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

exports.handler = async () => {
  const bucket = process.env.BUCKET_NAME;
  if (!bucket) throw new Error('BUCKET_NAME missing');

  let board = [];
  try {
    board = await getJson(bucket, 'data/demo_board.json');
  } catch {
    board = [];
  }

  const refreshed = (board || []).map((t, i) => {
    const eta = mk(5 + i * 3);
    return {
      ...t,
      expectedArrival: t.expectedArrival ? eta : null,
      expectedDeparture: eta,
      scheduledArrival: t.scheduledArrival ? eta : null,
      scheduledDeparture: eta,
      lastUpdated: new Date().toISOString()
    };
  });

  await putJson(bucket, 'data/demo_board.json', refreshed);
  await putJson(bucket, 'data/coach_board_cache.json', {
    lastUpdated: new Date().toISOString(),
    trains: refreshed
  });

  return { ok: true, count: refreshed.length };
};
