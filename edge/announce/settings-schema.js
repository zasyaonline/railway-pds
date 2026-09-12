'use strict';

const { defaultAnnouncements, SCHEMA_VERSION } = require('./defaults');
const { mergeOverlay, clone } = require('../overlay/merge');

const LANGS = ['te', 'en', 'hi'];
const TYPES = [
  'arriving',
  'departing',
  'delayed',
  'platform_changed',
  'cancelled',
  'rescheduled',
  'special',
  'greeting',
  'advisory',
  'boarding',
  'approaching',
  'manual',
  'live'
];
const STALE = new Set(['stop', 'last_known', 'confirm']);
const DELAY_MODES = new Set(['first_only', 'first_then_step']);

function asNumber(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  let out = n;
  if (min != null && out < min) out = min;
  if (max != null && out > max) out = max;
  return out;
}

function asClock(value, fallback) {
  const m = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return fallback;
  const hh = String(Math.min(23, Math.max(0, Number(m[1])))).padStart(2, '0');
  const mm = String(Math.min(59, Math.max(0, Number(m[2])))).padStart(2, '0');
  return `${hh}:${mm}`;
}

function sanitizeLanguages(list, fallback) {
  const src = Array.isArray(list) ? list : fallback;
  const out = [];
  for (const item of src) {
    const lang = String(item || '').slice(0, 8).toLowerCase();
    if (LANGS.includes(lang) && !out.includes(lang)) out.push(lang);
  }
  return out.length ? out : fallback.slice();
}

function sanitizeTypes(list, fallback) {
  const src = Array.isArray(list) ? list : fallback;
  const out = [];
  for (const item of src) {
    const t = String(item || '');
    if (TYPES.includes(t) && !out.includes(t)) out.push(t);
  }
  return out.length ? out : fallback.slice();
}

function sanitizeWindows(windows, fallback) {
  if (!Array.isArray(windows) || !windows.length) return clone(fallback);
  return windows.slice(0, 6).map((w, i) => ({
    fromMinutes: asNumber(w?.fromMinutes, fallback[i]?.fromMinutes ?? 30, 0, 180),
    toMinutes: asNumber(w?.toMinutes, fallback[i]?.toMinutes ?? 0, 0, 180),
    intervalMinutes: asNumber(w?.intervalMinutes, fallback[i]?.intervalMinutes ?? 5, 1, 60)
  }));
}

function sanitizePeriods(periods, fallback) {
  if (!Array.isArray(periods) || !periods.length) return clone(fallback);
  return periods.slice(0, 6).map((p, i) => ({
    id: String(p?.id || fallback[i]?.id || `p${i}`).slice(0, 24),
    start: asClock(p?.start, fallback[i]?.start || '06:00'),
    end: asClock(p?.end, fallback[i]?.end || '18:00'),
    db: asNumber(p?.db, fallback[i]?.db ?? 85, 40, 120)
  }));
}

function sanitizeClips(clips) {
  if (!Array.isArray(clips)) return [];
  return clips.slice(0, 50).map((c, i) => ({
    id: String(c?.id || `clip-${i + 1}`).slice(0, 64),
    type: c?.type === 'greeting' ? 'greeting' : 'advisory',
    extra: String(c?.extra || c?.text || '').slice(0, 400),
    wav: String(c?.wav || '').slice(0, 400),
    languages: sanitizeLanguages(c?.languages, LANGS.slice())
  }));
}

function sanitizeTemplates(incoming, fallback) {
  const out = clone(fallback);
  if (!incoming || typeof incoming !== 'object') return out;
  for (const [type, langs] of Object.entries(incoming)) {
    if (!TYPES.includes(type) && type !== 'departed') continue;
    if (!langs || typeof langs !== 'object') continue;
    out[type] = out[type] || {};
    for (const lang of LANGS) {
      if (typeof langs[lang] === 'string') out[type][lang] = langs[lang].slice(0, 800);
    }
  }
  return out;
}

function sanitizeAnnouncementSettings(raw, stationCode) {
  const defaults = defaultAnnouncements();
  const merged = mergeOverlay(defaults, raw && typeof raw === 'object' ? raw : {});
  const settings = clone(defaults);
  settings.schemaVersion = SCHEMA_VERSION;
  settings.version = SCHEMA_VERSION;
  settings.stationCode = String(stationCode || merged.stationCode || 'BG').trim().toUpperCase().slice(0, 6);
  settings.languages = sanitizeLanguages(merged.languages, defaults.languages);
  settings.languageOrder = sanitizeLanguages(merged.languageOrder || merged.languages, defaults.languageOrder);
  settings.multilingual = merged.multilingual !== false;
  settings.enabledTypes = sanitizeTypes(merged.enabledTypes, defaults.enabledTypes);
  settings.arrival = {
    clock: 'scheduled',
    startMinutes: asNumber(merged.arrival?.startMinutes, 30, 1, 180),
    windows: sanitizeWindows(merged.arrival?.windows, defaults.arrival.windows),
    shortNoticeMinutes: asNumber(merged.arrival?.shortNoticeMinutes, 5, 1, 30),
    shortNoticeCount: asNumber(merged.arrival?.shortNoticeCount, 2, 1, 5)
  };
  settings.delay = {
    minMinutes: asNumber(merged.delay?.minMinutes, 15, 0, 720),
    mode: DELAY_MODES.has(merged.delay?.mode) ? merged.delay.mode : 'first_only',
    stepMinutes: asNumber(merged.delay?.stepMinutes, 15, 1, 180),
    expressAs: 'minutes'
  };
  settings.departure = {
    clock: 'scheduled',
    minutesBefore: asNumber(merged.departure?.minutesBefore, 10, 0, 120),
    repeat: Boolean(merged.departure?.repeat)
  };
  settings.platformChange = {
    auto: merged.platformChange?.auto === true,
    requireStaffConfirm: merged.platformChange?.requireStaffConfirm !== false
  };
  settings.cancelled = {
    auto: merged.cancelled?.auto !== false,
    requireStaffConfirm: merged.cancelled?.requireStaffConfirm === true
  };
  settings.rescheduled = {
    auto: merged.rescheduled?.auto !== false,
    requireStaffConfirm: merged.rescheduled?.requireStaffConfirm === true
  };
  settings.staleNtes = STALE.has(merged.staleNtes) ? merged.staleNtes : 'stop';
  settings.skipFailedLanguage = merged.skipFailedLanguage !== false;
  settings.ntesRecovery = merged.ntesRecovery === 'manual' ? 'manual' : 'auto';
  settings.suppress = {
    cancelled: merged.suppress?.cancelled === true,
    diverted: merged.suppress?.diverted !== false,
    platformUnknown: merged.suppress?.platformUnknown === true,
    nightStart: merged.suppress?.nightStart || null,
    nightEnd: merged.suppress?.nightEnd || null
  };
  settings.volume = {
    mode: merged.volume?.mode === 'staff' ? 'staff' : 'time_of_day',
    default: asNumber(merged.volume?.default, 80, 0, 100),
    periods: sanitizePeriods(merged.volume?.periods, defaults.volume.periods),
    dbToGain: (() => {
      const gain = merged.volume?.dbToGain || {};
      return {
        85: asNumber(gain[85] ?? gain['85'], 100, 0, 100),
        75: asNumber(gain[75] ?? gain['75'], 80, 0, 100),
        70: asNumber(gain[70] ?? gain['70'], 60, 0, 100)
      };
    })()
  };
  settings.audio = {
    sink: String(merged.audio?.sink || 'default').slice(0, 80) || 'default',
    capture: String(merged.audio?.capture || 'default').slice(0, 80) || 'default',
    playCommand: merged.audio?.playCommand || null
  };
  settings.advisory = {
    idleSeconds: asNumber(merged.advisory?.idleSeconds, 120, 0, 3600),
    clips: sanitizeClips(merged.advisory?.clips)
  };
  settings.voices = {
    en: String(merged.voices?.en || ''),
    hi: String(merged.voices?.hi || ''),
    te: String(merged.voices?.te || '')
  };
  settings.historyRetention = asNumber(merged.historyRetention, 200, 20, 2000);
  settings.priority = defaults.priority;
  settings.triggers = defaults.triggers;
  settings.repeat = defaults.repeat;
  settings.templates = sanitizeTemplates(merged.templates, defaults.templates);
  return { ok: true, settings };
}

module.exports = {
  SCHEMA_VERSION,
  sanitizeAnnouncementSettings,
  LANGS,
  TYPES
};
