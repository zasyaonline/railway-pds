'use strict';

const { defaultAnnouncements, SCHEMA_VERSION } = require('./defaults');
const { mergeOverlay } = require('../overlay/merge');
const {
  loadStationDocument,
  saveStationOverlay,
  deleteStationOverlay,
  loadOverlayDocument,
  overlayExists
} = require('../overlay/load');
const { coachSourceDataDir } = require('../../shared/paths');
const { sanitizeAnnouncementSettings } = require('./settings-schema');

const FILE = 'announcements.json';

function loadAnnouncementConfig(stationCode, dataDir) {
  const defaults = defaultAnnouncements();
  const merged = loadStationDocument({
    dataDir: dataDir || coachSourceDataDir(),
    stationCode,
    fileName: FILE
  });
  const raw = mergeOverlay(defaults, merged || {});
  return sanitizeAnnouncementSettings(raw, stationCode).settings;
}

function announcementSettingsEnvelope(stationCode, dataDir) {
  const settings = loadAnnouncementConfig(stationCode, dataDir);
  const overlay = loadOverlayDocument(stationCode, FILE);
  return {
    stationCode: settings.stationCode,
    schemaVersion: SCHEMA_VERSION,
    updatedAt: overlay?.updatedAt || null,
    updatedBy: overlay?.updatedBy || null,
    source: overlayExists(stationCode, FILE) ? 'overlay' : 'defaults',
    settings
  };
}

function saveAnnouncementSettings(stationCode, body, actor) {
  const incoming = body?.settings && typeof body.settings === 'object' ? body.settings : body;
  const checked = sanitizeAnnouncementSettings(incoming, stationCode);
  const overlay = {
    ...checked.settings,
    schemaVersion: SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    updatedBy: actor || 'local-admin'
  };
  saveStationOverlay(stationCode, FILE, overlay);
  return announcementSettingsEnvelope(stationCode);
}

function resetAnnouncementSettings(stationCode, actor) {
  deleteStationOverlay(stationCode, FILE);
  return {
    ...announcementSettingsEnvelope(stationCode),
    resetBy: actor || 'local-admin',
    resetAt: new Date().toISOString()
  };
}

module.exports = {
  loadAnnouncementConfig,
  announcementSettingsEnvelope,
  saveAnnouncementSettings,
  resetAnnouncementSettings
};
