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

function applyTemplate(template, fields) {
  return String(template || '').replace(/\{([a-zA-Z]+)\}/g, (_, key) => {
    if (fields[key] == null || fields[key] === '') return '';
    return String(fields[key]);
  }).replace(/\s+/g, ' ').trim();
}

function renderAnnouncement({ type, lang, config, train, extra, minutes }) {
  const templates = config.templates?.[type] || config.templates?.manual || {};
  const template = templates[lang] || templates.en || '';
  const fields = {
    trainNo: speakDigits(train?.trainNo, lang),
    trainName: train?.trainName || '',
    platform: train?.platform && train.platform !== '-' ? speakDigits(train.platform, lang) : '',
    delay: speakNumber(train?.delay, lang),
    minutes: speakNumber(minutes, lang),
    extra: extra || ''
  };
  return applyTemplate(template, fields);
}

module.exports = {
  speakDigits,
  speakNumber,
  applyTemplate,
  renderAnnouncement
};
