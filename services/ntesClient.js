'use strict';

/**
 * NTES AppServAnd client — talks to the official Indian Railways mobile API.
 * Endpoint: POST https://enquiry.indianrail.gov.in/crisns/AppServAnd
 */

const { encryptPayload, decryptPayload } = require('./ntesCrypto');

const BASE_URL = 'https://enquiry.indianrail.gov.in/crisns/AppServAnd';
const USER_AGENT = 'Dalvik/2.1.0 (Linux; Android 11)';

async function ntesRequest(payloadStr, retries = 2) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(BASE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          charset: 'utf-8',
          'User-Agent': USER_AGENT
        },
        body: JSON.stringify({ jsonIn: encryptPayload(payloadStr) })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const text = await response.text();
      if (!text.trim()) {
        throw new Error('Empty response from NTES');
      }

      const data = JSON.parse(text);
      const decoded = data.jsonIn ? decryptPayload(data.jsonIn) : data;

      const errorMsg =
        decoded?.AlertMsg ||
        decoded?.alertMsg ||
        decoded?.AlertMsgHindi ||
        decoded?.alertMsgHindi;

      if (errorMsg) {
        throw new Error(errorMsg);
      }

      return decoded;
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
  }

  throw lastError;
}

/**
 * Live station board — trains arriving/departing at a station within N hours.
 * This is the primary data source for the PDS (current-time trains only).
 */
async function fetchStationLive(stationCode, hours = 4) {
  const payload =
    `service=TrainRunningMob&subService=TrainsAtStationJson` +
    `&jStation=${stationCode}&nHr=${hours}&jToStation=`;
  return ntesRequest(payload);
}

/**
 * Full running status for a single train (station-by-station timeline).
 */
async function fetchTrainRunning(trainNo, startDate) {
  const payload =
    `service=TrainRunningMob&subService=ShowFullRunJson` +
    `&trainNo=${trainNo}&startDate=${startDate}`;
  return ntesRequest(payload);
}

module.exports = {
  fetchStationLive,
  fetchTrainRunning,
  ntesRequest
};
