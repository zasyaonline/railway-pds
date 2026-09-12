'use strict';

const fs = require('fs');
const path = require('path');
const { readJson, atomicWriteJson } = require('../storage/atomic-file');
const { overlayStationDir, coachSourceDataDir } = require('../../shared/paths');
const { mergeOverlay } = require('./merge');

function normalizeStation(code) {
  return String(code || '').trim().toUpperCase();
}

function repoStationPath(dataDir, stationCode, fileName) {
  return path.join(dataDir, 'stations', normalizeStation(stationCode), fileName);
}

function overlayStationPath(stationCode, fileName) {
  return path.join(overlayStationDir(stationCode), fileName);
}

function loadJsonFile(filePath) {
  return readJson(filePath, null);
}

function loadStationDocument({ dataDir, stationCode, fileName }) {
  const dir = dataDir || coachSourceDataDir();
  const base = loadJsonFile(repoStationPath(dir, stationCode, fileName));
  const overlay = loadJsonFile(overlayStationPath(stationCode, fileName));
  if (base == null && overlay == null) return null;
  if (overlay == null) return base;
  return mergeOverlay(base || {}, overlay);
}

function overlayExists(stationCode, fileName) {
  try {
    return fs.existsSync(overlayStationPath(stationCode, fileName));
  } catch {
    return false;
  }
}

function saveStationOverlay(stationCode, fileName, data) {
  const dest = overlayStationPath(stationCode, fileName);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  atomicWriteJson(dest, data);
  return dest;
}

function deleteStationOverlay(stationCode, fileName) {
  const dest = overlayStationPath(stationCode, fileName);
  try {
    if (fs.existsSync(dest)) fs.unlinkSync(dest);
    return true;
  } catch {
    return false;
  }
}

function loadOverlayDocument(stationCode, fileName) {
  return loadJsonFile(overlayStationPath(stationCode, fileName));
}

module.exports = {
  normalizeStation,
  repoStationPath,
  overlayStationPath,
  loadStationDocument,
  overlayExists,
  saveStationOverlay,
  deleteStationOverlay,
  loadOverlayDocument
};
