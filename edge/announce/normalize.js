'use strict';

const DIGITS = {
  en: ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'],
  hi: ['शून्य', 'एक', 'दो', 'तीन', 'चार', 'पाँच', 'छह', 'सात', 'आठ', 'नौ'],
  te: ['సున్నా', 'ఒకటి', 'రెండు', 'మూడు', 'నాలుగు', 'ఐదు', 'ఆరు', 'ఏడు', 'ఎనిమిది', 'తొమ్మిది']
};

function speakDigits(value, lang) {
  const table = DIGITS[lang] || DIGITS.en;
  return String(value || '')
    .split('')
    .map((ch) => (/[0-9]/.test(ch) ? table[Number(ch)] : ch))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function speakNumber(n, lang) {
  const num = Number(n);
  if (!Number.isFinite(num)) return String(n || '');
  if (num <= 20 || lang !== 'en') return speakDigits(String(Math.trunc(num)), lang);
  return String(Math.trunc(num));
}

/**
 * Light pause cues for Piper PA delivery (after attention / train number / before platform).
 * Does not invent wording — only spreads existing sentence boundaries.
 */
function normalizeSpokenPauses(text) {
  let out = String(text || '').trim();
  if (!out) return '';
  out = out
    .replace(/\s+/g, ' ')
    .replace(/\s*\.\s*/g, '. ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\.\s+\./g, '.')
    .trim();
  return out;
}

function scrubEmptyRouteClauses(text) {
  return String(text || '')
    .replace(/\s+from\s+to\s+/gi, ' ')
    .replace(/\s+to\s+\./gi, '.')
    .replace(/\s+from\s+\./gi, '.')
    .replace(/\s+నుండి\s+వరకు\s*/g, ' ')
    .replace(/\s+से\s+तक\s*/g, ' ')
    .replace(/\s+से\s+।/g, '।')
    .replace(/\.\s*\./g, '.')
    .replace(/\s+/g, ' ')
    .trim();
}

function applyTemplate(template, fields) {
  const filled = String(template || '').replace(/\{([a-zA-Z]+)\}/g, (_, key) => {
    if (fields[key] == null || fields[key] === '') return '';
    return String(fields[key]);
  }).replace(/\s+/g, ' ').trim();
  return scrubEmptyRouteClauses(filled);
}

function routeFields(train) {
  const from = String(train?.from || train?.source || '').trim();
  const to = String(train?.to || train?.destination || '').trim();
  return { from, to };
}

function renderAnnouncement({ type, lang, config, train, extra, minutes }) {
  const mapped = type === 'departed' ? 'departing' : type;
  const templates = config.templates?.[mapped] || config.templates?.[type] || config.templates?.manual || {};
  const template = templates[lang] || templates.en || '';
  const { from, to } = routeFields(train);
  const platformDigits =
    train?.platform && train.platform !== '-' ? speakDigits(train.platform, lang) : '';
  const fields = {
    trainNo: speakDigits(train?.trainNo, lang),
    trainName: train?.trainName || '',
    platform: platformDigits,
    delay: speakNumber(train?.delay, lang),
    minutes: speakNumber(minutes, lang),
    from,
    to,
    extra: extra || ''
  };
  return normalizeSpokenPauses(applyTemplate(template, fields));
}

module.exports = {
  speakDigits,
  speakNumber,
  applyTemplate,
  normalizeSpokenPauses,
  renderAnnouncement
};
