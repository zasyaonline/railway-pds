'use strict';

const CONFIG = window.COACH_CONFIG || {};
const API_BASE = CONFIG.API_BASE || '';
const REFRESH_MS = CONFIG.REFRESH_MS || 15000;
const LANG_MS = CONFIG.LANG_ROTATE_MS || 15000;

const I18N = {
  en: {
    lang: 'EN',
    youAreHere: 'You are here',
    walkLeft: '← walk left',
    walkRight: 'walk right →',
    unavailable: 'Coach chart unavailable',
    idle: 'No train in coach-display window',
    next: 'Next',
    platform: 'PLATFORM',
    arr: 'Arr',
    dep: 'Dep'
  },
  te: {
    lang: 'తె',
    youAreHere: 'మీరు ఇక్కడ ఉన్నారు',
    walkLeft: '← ఎడమకు',
    walkRight: 'కుడికి →',
    unavailable: 'కోచ్ చార్ట్ అందుబాటులో లేదు',
    idle: 'కోచ్ ప్రదర్శన విండోలో రైలు లేదు',
    next: 'తదుపరి',
    platform: 'ప్లాట్‌ఫామ్',
    arr: 'రాక',
    dep: 'నిష్క్రమణ'
  },
  hi: {
    lang: 'हि',
    youAreHere: 'आप यहाँ हैं',
    walkLeft: '← बाएँ जाएँ',
    walkRight: 'दाएँ जाएँ →',
    unavailable: 'कोच चार्ट उपलब्ध नहीं',
    idle: 'कोच डिस्प्ले विंडो में कोई ट्रेन नहीं',
    next: 'अगली',
    platform: 'प्लेटफ़ॉर्म',
    arr: 'आगमन',
    dep: 'प्रस्थान'
  }
};

let languages = ['en', 'te', 'hi'];
let langIndex = 0;
let lastPayload = null;
let typesDoc = { types: {} };

function $(id) { return document.getElementById(id); }
function qs(name) {
  return new URLSearchParams(location.search).get(name);
}
function t(key) {
  const dict = I18N[languages[langIndex]] || I18N.en;
  return dict[key] || I18N.en[key] || key;
}
function locale() {
  return ({ en: 'en-IN', te: 'te-IN', hi: 'hi-IN' })[languages[langIndex]] || 'en-IN';
}

function updateClock() {
  const now = new Date();
  $('clock').textContent = now.toLocaleTimeString(locale(), {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });
  $('clockDate').textContent = now.toLocaleDateString(locale(), {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
  $('langLabel').textContent = t('lang');
}

function coachAsset(typeId) {
  const id = typeId || 'unknown';
  const types = (typesDoc && typesDoc.types) || {};
  const asset = (types[id] && types[id].asset) || `${id}.png`;
  return `/img/coaches/${asset}`;
}

function coachTile(coach, pinSlot) {
  const aligned = pinSlot != null && coach.seq - 1 === pinSlot;
  const typeId = coach.typeId || 'unknown';
  const kind = (typesDoc.types && typesDoc.types[typeId] && typesDoc.types[typeId].label) || typeId;
  return `
    <div class="coach ${typeId}${aligned ? ' pin-aligned' : ''}" data-seq="${coach.seq}">
      <img class="coach-art" src="${coachAsset(typeId)}" alt="${coach.label || coach.code}" draggable="false">
      <span class="code">${coach.label || coach.code}</span>
      <span class="kind">${kind}</span>
    </div>`;
}

function pinHtml(youAreHere, coachCount) {
  if (!youAreHere?.enabled || youAreHere.slotIndex == null || !coachCount) return '';
  const pct = ((youAreHere.slotIndex + 0.5) / coachCount) * 100;
  return `
    <div class="pin-row">
      <div class="you-pin" style="left:${pct}%">
        <div class="arrow">▲</div>
        <div class="label">${t('youAreHere')}</div>
      </div>
    </div>
    <div class="walk-hint"><span>${t('walkLeft')}</span><span>${t('walkRight')}</span></div>`;
}

function renderStrip(p) {
  const train = p.train;
  const header = train
    ? `<div class="strip-header">
        <div><strong>${t('platform')} ${p.platform}</strong>
          · ${train.trainNo} ${train.trainName || ''}
        </div>
        <div>
          ${train.expectedArrival ? `${t('arr')} ${train.expectedArrival}` : ''}
          ${train.expectedDeparture ? ` · ${t('dep')} ${train.expectedDeparture}` : ''}
        </div>
      </div>`
    : `<div class="strip-header"><strong>${t('platform')} ${p.platform}</strong></div>`;

  if (!p.inWindow) {
    return `<section class="platform-strip">${header}<div class="unavailable">${t('idle')}</div></section>`;
  }

  if (!p.compositionAvailable || !(p.coaches || []).length) {
    return `<section class="platform-strip">${header}<div class="unavailable">${t('unavailable')}</div></section>`;
  }

  const pinSlot = p.youAreHere?.enabled ? p.youAreHere.slotIndex : null;
  const tiles = p.coaches.map((c) => coachTile(c, pinSlot)).join('');
  return `
    <section class="platform-strip ${lastPayload?.display?.mode === 'single' ? 'single' : ''}">
      ${header}
      <div class="rake-wrap">
        <div class="rake">${tiles}</div>
        ${pinHtml(p.youAreHere, p.coaches.length)}
      </div>
    </section>`;
}

function render(payload) {
  lastPayload = payload;
  if (Array.isArray(payload.languages) && payload.languages.length) {
    languages = payload.languages;
    if (langIndex >= languages.length) langIndex = 0;
  }

  const title = (payload.stationName || payload.stationCode || 'Station').toUpperCase();
  $('stationTitle').textContent = title;
  document.title = `${title} — Coach Position`;
  $('displayName').textContent = payload.display?.name
    ? `${payload.display.name} · ${payload.display.mode}`
    : '';

  $('footerMeta').textContent = `${payload.stationCode || ''} · display ${payload.display?.id || '—'}`;
  $('footerWindow').textContent = `Window: T−${payload.showBeforeMinutes ?? 10} until +${payload.hideAfterDepartMinutes ?? 15}m after dep`;

  const board = $('board');
  if (payload.idle && !(payload.platforms || []).some((p) => p.inWindow)) {
    const next = payload.idle.nextTrain;
    board.innerHTML = `
      <div class="idle">
        <div>${t('idle')}</div>
        ${next ? `<div style="margin-top:1rem;color:#e2e8f0">${t('next')}: ${next.trainNo} ${next.trainName || ''} · PF ${next.platform} · ${next.minutesUntil} min</div>` : ''}
      </div>`;
    return;
  }

  board.innerHTML = (payload.platforms || []).map(renderStrip).join('');
}

async function loadTypes() {
  try {
    const res = await fetch(`${API_BASE}/api/coach-types`);
    if (res.ok) {
      typesDoc = await res.json();
      return;
    }
  } catch { /* fall through */ }
  try {
    const res = await fetch('/data/coach_types.json', { cache: 'no-store' });
    if (res.ok) typesDoc = await res.json();
  } catch { /* ignore */ }
}

async function loadBoard() {
  const display = qs('display') || 'entrance-main';
  try {
    const res = await fetch(`${API_BASE}/api/coach-board?display=${encodeURIComponent(display)}`, {
      cache: 'no-store'
    });
    if (res.ok) {
      const data = await res.json();
      render(data);
      return;
    }
  } catch {
    /* fall through to static fixture */
  }

  try {
    const res = await fetch(`/data/coach_board_cache.json?display=${encodeURIComponent(display)}`, {
      cache: 'no-store'
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    // Fixture may be a full board response already
    if (data.platforms) {
      if (data.display && display && data.display.id !== display) {
        data.display.id = display;
      }
      render(data);
      return;
    }
    throw new Error('Invalid static board fixture');
  } catch (err) {
    $('board').innerHTML = `<div class="idle">Unable to load: ${err.message}</div>`;
  }
}

updateClock();
setInterval(updateClock, 1000);
setInterval(() => {
  langIndex = (langIndex + 1) % languages.length;
  if (lastPayload) render(lastPayload);
  else updateClock();
}, LANG_MS);

loadTypes().then(loadBoard);
setInterval(loadBoard, REFRESH_MS);
