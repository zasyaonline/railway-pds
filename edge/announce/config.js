'use strict';

const { defaultAnnouncements } = require('./defaults');
const { mergeOverlay } = require('../overlay/merge');
const { loadStationDocument } = require('../overlay/load');
const { coachSourceDataDir } = require('../../shared/paths');

function loadAnnouncementConfig(stationCode, dataDir) {
  const defaults = defaultAnnouncements();
  const merged = loadStationDocument({
    dataDir: dataDir || coachSourceDataDir(),
    stationCode,
    fileName: 'announcements.json'
  });
  return mergeOverlay(defaults, merged || {});
}

module.exports = { loadAnnouncementConfig };
