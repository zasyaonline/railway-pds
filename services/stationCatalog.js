'use strict';

/** Preset NTES station codes shown in the admin dropdown. */
const STATION_PRESETS = [
  { code: 'CHZ', name: 'Charlapalli' },
  { code: 'SC', name: 'Secunderabad Jn' },
  { code: 'HYB', name: 'Hyderabad Deccan' },
  { code: 'KCG', name: 'Kacheguda' },
  { code: 'BMT', name: 'Begumpet' },
  { code: 'LPI', name: 'Lingampalli' },
  { code: 'MJF', name: 'Malkajgiri' },
  { code: 'NLDA', name: 'Nalgonda' }
];

function normalizeStationCode(code) {
  return String(code || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function findPreset(code) {
  const normalized = normalizeStationCode(code);
  return STATION_PRESETS.find((s) => s.code === normalized) || null;
}

function resolveStationInput({ stationCode, stationName }) {
  const code = normalizeStationCode(stationCode);
  if (!code || code.length < 2 || code.length > 6) {
    return { ok: false, error: 'stationCode must be 2–6 letters/digits (NTES code)' };
  }

  const preset = findPreset(code);
  const name = String(stationName || '').trim() || preset?.name || code;

  return {
    ok: true,
    stationCode: code,
    stationName: name,
    fromPreset: Boolean(preset)
  };
}

module.exports = {
  STATION_PRESETS,
  normalizeStationCode,
  findPreset,
  resolveStationInput
};
