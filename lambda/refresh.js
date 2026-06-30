'use strict';

/**
 * Lambda: refresh-board
 * Triggered by EventBridge every minute.
 * Fetches NTES live station board and writes to S3.
 */

const { getJson, putJson } = require('./lib/s3');
const { fetchLiveBoard, STATION_CODE } = require('./services/railwayService');

exports.handler = async () => {
  const bucket = process.env.BUCKET_NAME;
  if (!bucket) throw new Error('BUCKET_NAME not set');

  const config = await getJson(bucket, 'data/config.json');

  if (config.refreshEnabled === false) {
    console.log('[refresh] skipped — refresh disabled via config');
    return {
      statusCode: 200,
      body: JSON.stringify({ skipped: true, reason: 'refresh disabled' })
    };
  }

  const master = await getJson(bucket, 'data/trains.json');
  const stationCode = config.stationCode || STATION_CODE;

  const boardTrains = await fetchLiveBoard(stationCode, master, config);
  const lastUpdated = new Date().toISOString();

  await putJson(bucket, 'data/live_status.json', {
    lastUpdated,
    stationCode,
    trains: boardTrains
  });

  console.log(`[refresh] ${stationCode}: ${boardTrains.length} trains at ${lastUpdated}`);

  return {
    statusCode: 200,
    body: JSON.stringify({ stationCode, count: boardTrains.length, lastUpdated })
  };
};
