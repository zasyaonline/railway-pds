'use strict';

const DIGITS = {
  en: ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'],
  hi: ['शून्य', 'एक', 'दो', 'तीन', 'चार', 'पाँच', 'छह', 'सात', 'आठ', 'नौ'],
  te: ['సున్నా', 'ఒకటి', 'రెండు', 'మూడు', 'నాలుగు', 'ఐదు', 'ఆరు', 'ఏడు', 'ఎనిమిది', 'తొమ్మిది']
};

const CARDINAL = {
  en: {
    ones: ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'],
    teens: ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'],
    tens: ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
  },
  hi: {
    ones: ['शून्य', 'एक', 'दो', 'तीन', 'चार', 'पाँच', 'छह', 'सात', 'आठ', 'नौ'],
    teens: ['दस', 'ग्यारह', 'बारह', 'तेरह', 'चौदह', 'पंद्रह', 'सोलह', 'सत्रह', 'अठारह', 'उन्नीस'],
    tens: ['', '', 'बीस', 'तीस', 'चालीस', 'पचास', 'साठ', 'सत्तर', 'अस्सी', 'नब्बे'],
    /* 21–29 style compounds used on IR PA */
    compound: {
      21: 'इक्कीस', 22: 'बाईस', 23: 'तेईस', 24: 'चौबीस', 25: 'पच्चीस',
      26: 'छब्बीस', 27: 'सत्ताईस', 28: 'अट्ठाईस', 29: 'उनतीस',
      31: 'इकतीस', 32: 'बत्तीस', 33: 'तैंतीस', 34: 'चौंतीस', 35: 'पैंतीस',
      36: 'छत्तीस', 37: 'सैंतीस', 38: 'अड़तीस', 39: 'उनतालीस',
      41: 'इकतालीस', 42: 'बयालीस', 43: 'तैंतालीस', 44: 'चवालीस', 45: 'पैंतालीस',
      46: 'छियालीस', 47: 'सैंतालीस', 48: 'अड़तालीस', 49: 'उनचास',
      51: 'इक्यावन', 52: 'बावन', 53: 'तिरपन', 54: 'चौवन', 55: 'पचपन',
      56: 'छप्पन', 57: 'सत्तावन', 58: 'अट्ठावन', 59: 'उनसठ',
      61: 'इकसठ', 62: 'बासठ', 63: 'तिरसठ', 64: 'चौंसठ', 65: 'पैंसठ',
      66: 'छियासठ', 67: 'सड़सठ', 68: 'अड़सठ', 69: 'उनहत्तर',
      71: 'इकहत्तर', 72: 'बहत्तर', 73: 'तिहत्तर', 74: 'चौहत्तर', 75: 'पचहत्तर',
      76: 'छिहत्तर', 77: 'सतहत्तर', 78: 'अठहत्तर', 79: 'उनासी',
      81: 'इक्यासी', 82: 'बयासी', 83: 'तिरासी', 84: 'चौरासी', 85: 'पचासी',
      86: 'छियासी', 87: 'सतासी', 88: 'अठासी', 89: 'नवासी',
      91: 'इक्यानवे', 92: 'बानवे', 93: 'तिरानवे', 94: 'चौरानवे', 95: 'पंचानवे',
      96: 'छियानवे', 97: 'सत्तानवे', 98: 'अट्ठानवे', 99: 'निन्यानवे'
    }
  },
  te: {
    ones: ['సున్నా', 'ఒకటి', 'రెండు', 'మూడు', 'నాలుగు', 'ఐదు', 'ఆరు', 'ఏడు', 'ఎనిమిది', 'తొమ్మిది'],
    teens: ['పది', 'పదకొండు', 'పన్నెండు', 'పదమూడు', 'పద్నాలుగు', 'పదిహేను', 'పదహారు', 'పదిహేడు', 'పద్దెనిమిది', 'పందొమ్మిది'],
    tens: ['', '', 'ఇరవై', 'ముప్పై', 'నలభై', 'యాభై', 'అరవై', 'డెబ్బై', 'ఎనభై', 'తొంభై']
  }
};

function speakDigits(value, lang) {
  const table = DIGITS[lang] || DIGITS.en;
  const parts = String(value || '')
    .split('')
    .map((ch) => (/[0-9]/.test(ch) ? table[Number(ch)] : ch))
    .filter((p) => p !== '');
  /* Telugu: comma pauses so Venkatesh does not rush the train number. */
  const joiner = lang === 'te' ? ', ' : ' ';
  return parts.join(joiner).replace(/\s+/g, ' ').trim();
}

const NAME_EXPAND = [
  [/\bEXPRESS\b/gi, 'Express'],
  [/\bEXP\b/gi, 'Express'],
  [/\bSUPERFAST\b/gi, 'Superfast'],
  [/\bSF\b/gi, 'Superfast'],
  [/\bJUNCTION\b/gi, 'Junction'],
  [/\bJN\b/gi, 'Junction'],
  [/\bMAIL\b/gi, 'Mail'],
  [/\bPASS(?:ENGER)?\b/gi, 'Passenger'],
  [/\bLOCAL\b/gi, 'Local'],
  [/\bSPL\b/gi, 'Special'],
  [/\bSPECIAL\b/gi, 'Special']
];

function titleCaseToken(token) {
  if (!token) return token;
  if (!/[A-Za-z]/.test(token)) return token;
  /* Keep short all-caps codes (e.g. AC) as letters if length <= 2 */
  if (token.length <= 2 && token === token.toUpperCase()) {
    return token.toUpperCase();
  }
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

/**
 * Make NTES-style names speakable: "GOLCONDA EXP" → "Golconda Express".
 * Leaves Telugu/Hindi script alone; expands Latin abbreviations for all langs.
 */
function speakProperName(raw) {
  let s = String(raw || '').trim();
  if (!s) return '';
  for (const [re, rep] of NAME_EXPAND) {
    s = s.replace(re, rep);
  }
  const hasIndic = /[\u0900-\u097F\u0C00-\u0C7F]/.test(s);
  if (!hasIndic && /[A-Za-z]/.test(s)) {
    s = s
      .split(/(\s+)/)
      .map((part) => (/^\s+$/.test(part) ? part : titleCaseToken(part)))
      .join('');
  }
  return s.replace(/\s+/g, ' ').trim();
}

function speakCardinal(n, lang) {
  const num = Number(n);
  if (!Number.isFinite(num)) return String(n || '');
  const value = Math.trunc(Math.abs(num));
  const code = CARDINAL[lang] ? lang : 'en';
  const table = CARDINAL[code];

  if (code === 'hi') {
    if (value < 10) return table.ones[value];
    if (value < 20) return table.teens[value - 10];
    if (table.compound[value]) return table.compound[value];
    if (value < 100) {
      const t = Math.floor(value / 10);
      const o = value % 10;
      return o ? `${table.tens[t]} ${table.ones[o]}` : table.tens[t];
    }
    if (value < 1000) {
      const h = Math.floor(value / 100);
      const r = value % 100;
      const head = `${table.ones[h]} सौ`;
      return r ? `${head} ${speakCardinal(r, 'hi')}` : head;
    }
    return speakDigits(String(value), 'hi');
  }

  if (code === 'te') {
    if (value < 10) return table.ones[value];
    if (value < 20) return table.teens[value - 10];
    if (value < 100) {
      const t = Math.floor(value / 10);
      const o = value % 10;
      return o ? `${table.tens[t]} ${table.ones[o]}` : table.tens[t];
    }
    if (value < 1000) {
      const h = Math.floor(value / 100);
      const r = value % 100;
      const head = `${table.ones[h]} వంద`;
      return r ? `${head} ${speakCardinal(r, 'te')}` : head;
    }
    return speakDigits(String(value), 'te');
  }

  /* English */
  if (value < 10) return table.ones[value];
  if (value < 20) return table.teens[value - 10];
  if (value < 100) {
    const t = Math.floor(value / 10);
    const o = value % 10;
    return o ? `${table.tens[t]} ${table.ones[o]}` : table.tens[t];
  }
  if (value < 1000) {
    const h = Math.floor(value / 100);
    const r = value % 100;
    const head = `${table.ones[h]} hundred`;
    return r ? `${head} ${speakCardinal(r, 'en')}` : head;
  }
  return String(value);
}

/** Quantities (delay / minutes) — natural numbers, never digit-by-digit. */
function speakNumber(n, lang) {
  return speakCardinal(n, lang);
}

/**
 * Clock times for PA: 3:15 → "three fifteen", not "three one five".
 * Hours 0–23 spoken as cardinals; minutes 00 → o'clock / बजे / గంటలు.
 */
function speakClockTime(hour, minute, lang) {
  const h = Number(hour);
  const m = Number(minute);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    return '';
  }
  const code = CARDINAL[lang] ? lang : 'en';
  const hourSpoken = speakCardinal(h, code);
  if (m === 0) {
    if (code === 'hi') return `${hourSpoken} बजे`;
    if (code === 'te') return `${hourSpoken} గంటలు`;
    return `${hourSpoken} o'clock`;
  }
  const minuteSpoken = speakCardinal(m, code);
  return `${hourSpoken} ${minuteSpoken}`;
}

/** Rewrite HH:MM / H:MM in free text (manual extra, etc.) without touching train digits already expanded. */
function expandSpokenTimes(text, lang) {
  return String(text || '').replace(/\b(\d{1,2}):(\d{2})\b/g, (match, hh, mm) => {
    const spoken = speakClockTime(hh, mm, lang);
    return spoken || match;
  });
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

/** Ensure a spoken slot ends with a sentence pause (Piper sentence_silence). */
function endWithPause(value) {
  const t = String(value || '').trim();
  if (!t) return '';
  if (/[.。।…]$/.test(t)) return t;
  return `${t}.`;
}

/**
 * Stop train-number / name from running into platform cue (esp. TE/HI overlays
 * that omit punctuation). Do not split English "on platform number".
 */
function ensurePlatformPause(text) {
  return String(text || '')
    .replace(/([^\s.。।,;:…])\s+(प्लेटफॉर्म)/g, '$1. $2')
    .replace(/([^\s.。।,;:…])\s+(ప్లాట్[\u200c\u200d]?ఫామ్)/g, '$1. $2')
    .replace(/([^\s.。।,;:…])\s+(ప్లాట్ఫామ్)/g, '$1. $2');
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
  const from = speakProperName(train?.from || train?.source || '');
  const to = speakProperName(train?.to || train?.destination || '');
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
    trainNo: endWithPause(speakDigits(train?.trainNo, lang)),
    trainName: endWithPause(speakProperName(train?.trainName || '')),
    platform: platformDigits,
    delay: speakNumber(train?.delay, lang),
    minutes: speakNumber(minutes, lang),
    from,
    to,
    extra: expandSpokenTimes(extra || '', lang)
  };
  const filled = applyTemplate(template, fields);
  return normalizeSpokenPauses(ensurePlatformPause(expandSpokenTimes(filled, lang)));
}

module.exports = {
  speakDigits,
  speakNumber,
  speakCardinal,
  speakClockTime,
  speakProperName,
  expandSpokenTimes,
  applyTemplate,
  normalizeSpokenPauses,
  ensurePlatformPause,
  endWithPause,
  renderAnnouncement
};
