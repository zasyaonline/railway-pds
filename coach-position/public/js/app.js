'use strict';

const CONFIG = window.COACH_CONFIG || {};
const API_BASE = CONFIG.API_BASE || '';
const REFRESH_MS = CONFIG.REFRESH_MS || 15000;
const LANG_MS = CONFIG.LANG_ROTATE_MS || 15000;
const SESSION_KEY = 'coach_session_id';
const BOGIE_DEFAULT = 25;
const WALK_SPEED_MPS = 0.65;

let sessionStopped = false;

let languages = ['en', 'te', 'hi'];
let langIndex = 0;
let lastPayload = null;
let typesDoc = { types: {} };
let stationLayout = null;
let stationsByNameMap = {};
let lastPickMinute = -1;

function $(id) { return document.getElementById(id); }
function qs(name) {
  return new URLSearchParams(location.search).get(name);
}
const THEME = String(
  qs('theme') || (document.body.classList.contains('theme-chart') ? 'chart' : 'tv')
).toLowerCase();
if (THEME === 'chart') document.body.classList.add('theme-chart');

function applyViewportMode() {
  const h = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
  document.body.dataset.vh = h < 600 ? 'tiny' : h < 800 ? 'short' : 'full';
}
applyViewportMode();
window.addEventListener('resize', applyViewportMode);
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', applyViewportMode);
}
function getSessionId() {
  try {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      id = (crypto.randomUUID && crypto.randomUUID()) ||
        `s-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return `s-${Date.now()}`;
  }
}
function clearSessionId() {
  try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}
function newSessionId() {
  clearSessionId();
  return getSessionId();
}
function isSessionStoppedPayload(data) {
  return data && (data.error === 'session_stopped' || data.sessionStopped === true);
}
function timeToMinutes(timeStr) {
  if (!timeStr || timeStr === '--') return null;
  const m = String(timeStr).match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}
function clockMinutesUntil(timeStr, now = new Date()) {
  const event = timeToMinutes(timeStr);
  if (event == null) return null;
  const nowMins = now.getHours() * 60 + now.getMinutes();
  let diff = event - nowMins;
  if (diff < -720) diff += 1440;
  if (diff > 720) diff -= 1440;
  return diff;
}
function liveMinutesUntil(train, hideAfter = 0) {
  const arr = clockMinutesUntil(eventTime(train, 'arr'));
  const dep = clockMinutesUntil(eventTime(train, 'dep'));
  if (dep != null && dep < 0 && -dep > hideAfter) return null;
  if (arr != null && arr > 0) return arr;
  if (dep != null && dep >= 0) return 0;
  if (arr != null && arr <= 0 && (dep == null || dep >= 0)) return 0;
  return null;
}
function currentLang() {
  return languages[langIndex] || 'en';
}
function t(key) {
  const pack = window.COACH_I18N || {};
  const dict = pack[currentLang()] || pack.en || {};
  const en = pack.en || {};
  return dict[key] || en[key] || key;
}
function locale() {
  const dict = (window.COACH_I18N && window.COACH_I18N[currentLang()]) || {};
  return dict.locale || 'en-IN';
}
function locStation(name) {
  return window.COACH_localizeStationName
    ? window.COACH_localizeStationName(name, currentLang(), stationsByNameMap)
    : (name || '—');
}
function locTrain(name) {
  return window.COACH_localizeTrainName
    ? window.COACH_localizeTrainName(name, currentLang())
    : (name || '—');
}
function locStatus(status) {
  return window.COACH_translateStatus
    ? window.COACH_translateStatus(status, currentLang())
    : (status || '—');
}

function eventTime(train, kind) {
  if (kind === 'arr') return train?.expectedArrival || train?.scheduledArrival;
  return train?.expectedDeparture || train?.scheduledDeparture;
}

function rowDeparted(row, now, hideAfter) {
  const dep = clockMinutesUntil(eventTime(row, 'dep'), now);
  if (/depart/i.test(row.status || '') || row.runningState === 'departed') {
    if (hideAfter > 0 && dep != null && -dep <= hideAfter) return false;
    return true;
  }
  return dep != null && dep < 0 && -dep > hideAfter;
}

function pickLiveFocus(payload, now = new Date()) {
  const showBefore = payload.showBeforeMinutes ?? 10;
  const hideAfter = payload.hideAfterDepartMinutes ?? 0;
  const rows = payload.stationBoard || [];
  const rakes = payload.boardRakes || {};

  function asTrain(r) {
    const rake = rakes[String(r.trainNo)] || {};
    return Object.assign({}, rake, r, { trainNo: r.trainNo });
  }

  const inWindow = [];
  for (const r of rows) {
    const t = asTrain(r);
    if (rowDeparted(t, now, hideAfter)) continue;
    const arr = clockMinutesUntil(eventTime(t, 'arr'), now);
    const dep = clockMinutesUntil(eventTime(t, 'dep'), now);
    const atPlatform = t.runningState === 'arrived' || /arriv/i.test(t.status || '');
    if (atPlatform && (dep == null || dep >= 0)) {
      inWindow.push({ train: t, minutesUntil: 0, inWindow: true });
      continue;
    }
    const soonest = [arr, dep].filter((x) => x != null && x >= 0);
    const minPos = soonest.length ? Math.min(...soonest) : null;
    if (minPos != null && minPos <= showBefore) {
      inWindow.push({ train: t, minutesUntil: minPos, inWindow: true });
    }
  }
  inWindow.sort((a, b) => (a.minutesUntil ?? 999) - (b.minutesUntil ?? 999));
  if (inWindow[0]) return inWindow[0];

  let best = null;
  for (const r of rows) {
    const t = asTrain(r);
    if (rowDeparted(t, now, hideAfter)) continue;
    const arr = clockMinutesUntil(eventTime(t, 'arr'), now);
    const dep = clockMinutesUntil(eventTime(t, 'dep'), now);
    const m = [arr, dep].filter((x) => x != null && x >= 0);
    if (!m.length) continue;
    const minutesUntilEvent = Math.min(...m);
    if (!best || minutesUntilEvent < best.minutesUntil) {
      best = { train: t, minutesUntil: minutesUntilEvent, inWindow: false };
    }
  }
  return best;
}

function resolveClientPin(display, platform, coaches, bogie) {
  const cfg = display?.youAreHere;
  if (!cfg || !(coaches || []).length) {
    return { enabled: false, slotIndex: null, platform: String(platform), samePlatform: false };
  }
  const bogieM = bogie || BOGIE_DEFAULT;
  let slot =
    typeof cfg.slotIndex === 'number'
      ? cfg.slotIndex
      : Math.round((Number(cfg.metersFromEngineEnd) || 0) / bogieM);
  slot = Math.max(0, Math.min(coaches.length - 1, slot));
  return {
    enabled: true,
    slotIndex: slot,
    platform: String(platform),
    configuredPlatform: String(cfg.platform || ''),
    samePlatform: String(cfg.platform) === String(platform),
    facing: cfg.facing || 'engine_left',
    metersFromEngineEnd: cfg.metersFromEngineEnd
  };
}

function rakeFor(payload, trainNo) {
  const key = String(trainNo);
  const fromBoard = (payload.boardRakes || {})[key];
  if (fromBoard && (fromBoard.coaches || []).length) return fromBoard;
  if (payload.focus?.train && String(payload.focus.train.trainNo) === key) {
    return payload.focus;
  }
  return fromBoard || {};
}

function assembleFocus(payload, pick) {
  if (!pick || !pick.train) return null;
  const t = pick.train;
  const rake = rakeFor(payload, t.trainNo);
  const coaches = rake.coaches || [];
  const bogie = payload.bogieLengthMeters || BOGIE_DEFAULT;
  const youAreHere = resolveClientPin(payload.display, t.platform, coaches, bogie);
  return {
    platform: String(t.platform),
    inWindow: pick.inWindow !== false,
    train: {
      trainNo: t.trainNo,
      trainName: t.trainName || rake.trainName,
      platform: String(t.platform),
      from: t.from || rake.from,
      to: t.to || rake.to,
      expectedArrival: t.expectedArrival || rake.expectedArrival,
      expectedDeparture: t.expectedDeparture || rake.expectedDeparture,
      minutesUntil: pick.minutesUntil,
      status: t.status || rake.status,
      delay: t.delay ?? rake.delay ?? 0
    },
    heading: rake.heading,
    compositionAvailable: Boolean(rake.compositionAvailable && coaches.length),
    coaches,
    coachCount: rake.coachCount || coaches.length,
    divyangjanPositions: rake.divyangjanPositions || [],
    divyangjanCoaches: rake.divyangjanCoaches || [],
    youAreHere,
    featured: true
  };
}
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
  document.documentElement.lang = currentLang();
  const minute = now.getHours() * 60 + now.getMinutes();
  if (lastPayload && minute !== lastPickMinute) {
    lastPickMinute = minute;
    render(lastPayload);
  }
}

function coachAsset(typeId) {
  const id = typeId || 'unknown';
  if (THEME === 'chart') return `/img/chart/${id}.svg`;
  const types = (typesDoc && typesDoc.types) || {};
  const asset = (types[id] && types[id].asset) || `${id}.png`;
  return `/img/coaches/${asset}`;
}

function normStation(s) {
  return String(s || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function matchesSide(stationName, labels) {
  const n = normStation(stationName);
  if (!n || !Array.isArray(labels)) return false;
  return labels.some((label) => {
    const L = normStation(label);
    if (!L) return false;
    return n === L || n.includes(L) || L.includes(n);
  });
}

function resolveHeading(train, existing, layout) {
  if (existing && existing.direction && existing.direction !== 'unknown') {
    return existing;
  }
  const from = train?.from || null;
  const to = train?.to || null;
  const axis = layout?.screenAxis || {};
  const leftLabels = axis.leftToward || axis.leftLabels || [];
  const rightLabels = axis.rightToward || axis.rightLabels || [];

  let direction = 'unknown';
  if (matchesSide(to, rightLabels)) direction = 'right';
  else if (matchesSide(to, leftLabels)) direction = 'left';
  else if (matchesSide(from, leftLabels)) direction = 'right';
  else if (matchesSide(from, rightLabels)) direction = 'left';

  return {
    direction,
    toward: to || null,
    from: from || null,
    engineSide: direction === 'right' ? 'right' : 'left'
  };
}

function formatWalk(meters, seconds) {
  if (meters == null) return '';
  if (meters === 0) return t('here');
  return `${meters}${t('meters')}`;
}

function formatWalkTime(meters, seconds) {
  if (meters == null || meters === 0) return '';
  if (seconds < 60) return `${t('walk')} ${seconds} ${t('sec')}`;
  const mins = Math.max(1, Math.round(seconds / 60));
  return `${t('walk')} ${mins} ${t('min')}`;
}

function ensureWalkMetrics(coaches, youAreHere, bogie) {
  const pin = youAreHere?.enabled && youAreHere.slotIndex != null ? youAreHere.slotIndex : null;
  const bogieM = bogie || BOGIE_DEFAULT;
  return (coaches || []).map((c) => {
    if (pin == null) return { ...c, walkMeters: null, walkSeconds: null };
    const slots = Math.abs((c.position != null ? c.position : c.seq - 1) - pin);
    const walkMeters = slots * bogieM;
    return { ...c, walkMeters, walkSeconds: Math.round(walkMeters / WALK_SPEED_MPS) };
  });
}

function coachTile(coach, pinSlot) {
  const pos = coach.position != null ? coach.position : coach.seq - 1;
  const aligned = pinSlot != null && pos === pinSlot;
  const typeId = coach.typeId || 'unknown';
  const typeMeta = (typesDoc.types && typesDoc.types[typeId]) || {};
  const lang = currentLang();
  const kind =
    (lang === 'te' && typeMeta.labelTe) ||
    (lang === 'hi' && typeMeta.labelHi) ||
    typeMeta.label ||
    typeId;
  const code = String(coach.label || coach.code || '');
  const showKind = THEME !== 'chart' && kind && kind.toUpperCase() !== code.toUpperCase();
  const shown = THEME === 'chart' ? pos + 1 : pos;
  const divClass = coach.divyangjan ? ' divyangjan' : '';
  return `
    <div class="coach ${typeId}${aligned ? ' pin-aligned' : ''}${divClass}" data-pos="${pos}">
      <span class="num" title="${t('coachNo')} ${shown}">${shown}</span>
      ${coach.divyangjan ? `<span class="divyang-badge" title="${t('divyangjan')}">♿</span>` : ''}
      <img class="coach-art" src="${coachAsset(typeId)}" alt="${esc(code)}" draggable="false">
      <span class="code">${esc(code)}</span>
      ${showKind ? `<span class="kind">${esc(kind)}</span>` : ''}
    </div>`;
}

function walkStripHtml(coaches, pinEnabled) {
  if (!pinEnabled || !coaches.length) return '';
  const cells = coaches.map((c) => {
    const dist = formatWalk(c.walkMeters, c.walkSeconds);
    const time = formatWalkTime(c.walkMeters, c.walkSeconds);
    const here = c.walkMeters === 0;
    return `
      <div class="walk-cell${here ? ' is-here' : ''}">
        <span class="walk-dist">${esc(dist)}</span>
        ${time ? `<span class="walk-time">${esc(time)}</span>` : ''}
      </div>`;
  }).join('');
  return `<div class="walk-strip" aria-label="Walk distance">${cells}</div>`;
}

function platformHtml(youAreHere, coaches, engineOnRight) {
  const count = coaches.length;
  const pinEnabled = Boolean(youAreHere?.enabled && youAreHere.slotIndex != null && count);
  let pin = '';
  if (pinEnabled) {
    const displaySlot = engineOnRight
      ? count - 1 - youAreHere.slotIndex
      : youAreHere.slotIndex;
    const pct = ((displaySlot + 0.5) / count) * 100;
    pin = `
      <div class="you-pin" style="left:${pct}%">
        <img class="traveler" src="/img/you-are-here.png" alt="" draggable="false">
        <div class="pin-cluster">
          <span class="label">${t('youAreHere')}</span>
        </div>
      </div>`;
  }

  const ticks = coaches.map(() => '<span class="bay-tick"></span>').join('');

  return `
    <div class="platform" style="--coach-count:${count}">
      <div class="platform-coping" aria-hidden="true"></div>
      <div class="platform-deck">
        <div class="platform-grain" aria-hidden="true"></div>
        <div class="yellow-line" aria-hidden="true"></div>
        <div class="bay-ticks" aria-hidden="true">${ticks}</div>
        ${walkStripHtml(coaches, pinEnabled)}
        <div class="pin-row">${pin}</div>
      </div>
    </div>`;
}

function divyangjanBanner(p) {
  const list = p.divyangjanCoaches || [];
  if (!list.length) {
    return `<div class="divyangjan-banner muted" role="status">♿ ${esc(t('divyangjanNone'))}</div>`;
  }
  if (THEME === 'chart') {
    const bits = list
      .map((c) => {
        const n = (c.position != null ? c.position : 0) + 1;
        return `${esc(t('divyangjanAtPos').replace('{n}', String(n)))} (${esc(c.code)})`;
      })
      .join(' · ');
    return `<div class="divyangjan-banner" role="status">♿ ${bits}</div>`;
  }
  const bits = list
    .map((c) => `${esc(t('divyangjanAt'))} <strong>${c.position}</strong> (${esc(c.code)})`)
    .join(' · ');
  return `<div class="divyangjan-banner" role="status">♿ ${bits}</div>`;
}

function headingBanner(heading) {
  const destRaw = heading?.toward;
  if (!destRaw) return '';
  const dest = locStation(destRaw);
  const dir = heading.direction === 'left' ? 'left' : heading.direction === 'right' ? 'right' : 'unknown';
  const lang = currentLang();
  const towardBits =
    lang === 'en'
      ? `<span class="towards-label">${esc(t('towards'))}</span><strong class="dest">${esc(dest)}</strong>`
      : `<strong class="dest">${esc(dest)}</strong><span class="towards-label">${esc(t('towards'))}</span>`;

  if (dir === 'left') {
    return `
      <div class="heading-banner heading-left" aria-label="${esc(t('towards'))} ${esc(dest)}">
        <span class="motion" aria-hidden="true">◀◀◀</span>
        ${towardBits}
        <span class="motion trail" aria-hidden="true">◀◀◀</span>
      </div>`;
  }
  if (dir === 'right') {
    return `
      <div class="heading-banner heading-right" aria-label="${esc(t('towards'))} ${esc(dest)}">
        <span class="motion trail" aria-hidden="true">▶▶▶</span>
        ${towardBits}
        <span class="motion" aria-hidden="true">▶▶▶</span>
      </div>`;
  }
  return `<div class="heading-banner heading-unknown">${towardBits}</div>`;
}

function renderStationBoard(rows, focusTrainNo) {
  if (!rows || !rows.length) return '';
  const body = rows.slice(0, 8).map((r) => {
    const active = focusTrainNo && String(r.trainNo) === String(focusTrainNo);
    const delay =
      r.delay > 0
        ? `<span class="delay">${esc(r.delay)} ${t('min')}</span>`
        : `<span class="ontime">—</span>`;
    return `
      <tr class="${active ? 'is-focus' : ''}">
        <td class="mono">${esc(r.trainNo)}</td>
        <td>${esc(locTrain(r.trainName))}</td>
        <td class="pf">${esc(r.platform)}</td>
        <td class="mono">${esc(r.expectedArrival || '—')}</td>
        <td class="mono">${esc(r.expectedDeparture || '—')}</td>
        <td>${delay}</td>
        <td>${esc(locStatus(r.status || '—'))}</td>
      </tr>`;
  }).join('');

  return `
    <section class="station-board-panel">
      <div class="panel-title">${t('stationBoard')}</div>
      <table class="station-board">
        <thead>
          <tr>
            <th>${t('trainNo')}</th>
            <th>${t('trainName')}</th>
            <th>${t('pf')}</th>
            <th>${t('arr')}</th>
            <th>${t('dep')}</th>
            <th>${t('delay')}</th>
            <th>${t('status')}</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </section>`;
}

function renderFocus(p, bogie, shouldArrive) {
  if (!p) {
    return `<section class="focus-panel"><div class="unavailable">${t('idle')}</div></section>`;
  }

  const train = p.train;
  const heading = resolveHeading(train, p.heading, stationLayout);
  const engineOnRight = heading.engineSide === 'right';
  const hideAfter = lastPayload?.hideAfterDepartMinutes ?? 0;
  const mins = liveMinutesUntil(train, hideAfter);
  const eta =
    mins == null
      ? ''
      : mins <= 0
        ? t('now')
        : `${mins} ${t('min')}`;
  const kicker = p.inWindow ? t('nextArrival') : t('next');

  const header = `
    <div class="focus-header">
      <div class="focus-kicker">${kicker}</div>
      <div class="focus-main">
        <div class="focus-id">
          <strong>${esc(train.trainNo)}</strong>
          <span>${esc(locTrain(train.trainName || ''))}</span>
        </div>
        <div class="focus-meta">
          <span class="pill">${t('platform')} ${esc(p.platform)}</span>
          ${eta ? `<span class="eta">${esc(eta)}</span>` : ''}
        </div>
      </div>
    </div>`;

  if (!p.compositionAvailable || !(p.coaches || []).length) {
    return `<section class="focus-panel">${header}<div class="unavailable">${t('unavailable')}</div></section>`;
  }

  const pinSlot = p.youAreHere?.enabled ? p.youAreHere.slotIndex : null;
  const withWalk = ensureWalkMetrics(p.coaches, p.youAreHere, bogie);
  const coaches = engineOnRight ? [...withWalk].reverse() : withWalk;
  const tiles = coaches.map((c) => coachTile(c, pinSlot)).join('');
  const arriveClass = shouldArrive ? 'is-arriving' : '';
  const rakeClass = `rake ${engineOnRight ? 'engine-right' : 'engine-left'} ${arriveClass}`.trim();
  const count = p.coaches.length;
  const pinNote =
    p.youAreHere?.enabled && p.youAreHere.samePlatform === false
      ? `<p class="pin-note">${t('trainOnPlatform').replace('{n}', esc(p.platform))}</p>`
      : '';

  return `
    <section class="focus-panel">
      ${header}
      ${headingBanner(heading)}
      ${divyangjanBanner(p)}
      <div class="rake-wrap">
        <div class="rake-stage ${arriveClass}" style="--coach-count:${count}">
          <div class="${rakeClass}">${tiles}</div>
          <div class="track" aria-hidden="true">
            <div class="ballast"></div>
            <div class="sleepers"></div>
            <div class="rail rail-far"></div>
            <div class="rail rail-near"></div>
            <div class="rail-glow"></div>
          </div>
          ${platformHtml(p.youAreHere, coaches, engineOnRight)}
        </div>
        ${pinNote}
      </div>
    </section>`;
}

function render(payload) {
  lastPayload = payload;
  if (Array.isArray(payload.languages) && payload.languages.length) {
    languages = payload.languages;
    if (langIndex >= languages.length) langIndex = 0;
  }

  const title = locStation(payload.stationName || payload.stationCode || 'Station');
  if (THEME === 'chart') {
    $('stationTitle').textContent = `${t('coachPosition')} | ${String(payload.stationCode || title).toUpperCase()}`;
  } else {
    $('stationTitle').textContent = String(title).toUpperCase();
  }
  document.title = `${title} — Coach Position`;
  document.documentElement.lang = currentLang();
  $('displayName').textContent = payload.display?.name
    ? `${payload.display.name} · ${payload.display.mode}`
    : '';
  const adminLink = document.querySelector('.admin-link');
  if (adminLink) adminLink.textContent = t('admin');
  const themeLink = $('themeLink');
  if (themeLink) {
    const displayId = qs('display') || 'entrance-main';
    if (THEME === 'chart') {
      themeLink.href = `/?display=${encodeURIComponent(displayId)}`;
      themeLink.textContent = t('tvView');
    } else {
      themeLink.href = `/chart.html?display=${encodeURIComponent(displayId)}`;
      themeLink.textContent = t('chartView');
    }
  }

  const pick = pickLiveFocus(payload);
  const focus = assembleFocus(payload, pick);
  lastPickMinute = new Date().getHours() * 60 + new Date().getMinutes();

  $('footerMeta').textContent = `${payload.stationCode || ''} · ${payload.dataSource === 'ntes-live' ? t('live') : (payload.dataSource || 'cache')} · display ${payload.display?.id || '—'}`;
  $('footerWindow').textContent = t('footerWindow')
    .replace('{before}', String(payload.showBeforeMinutes ?? 10))
    .replace('{bogie}', String(payload.bogieLengthMeters ?? 25))
    .replace('{coaches}', String(focus?.coachCount || payload.liveTrainCount || '—'));
  const focusKey = focus?.train?.trainNo ? `${focus.train.trainNo}@${focus.platform}` : '';
  const shouldArrive = Boolean(focusKey && focusKey !== window.__coachFocusKey);
  if (focusKey) window.__coachFocusKey = focusKey;

  const board = $('board');
  board.innerHTML = `
    ${renderStationBoard(payload.stationBoard || [], focus?.train?.trainNo)}
    ${renderFocus(focus, payload.bogieLengthMeters, shouldArrive)}
  `;
  board.querySelectorAll('.rake.is-arriving').forEach((el) => {
    el.addEventListener('animationend', () => {
      el.classList.remove('is-arriving');
      el.closest('.rake-stage')?.classList.remove('is-arriving');
    }, { once: true });
  });
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

async function loadStations() {
  try {
    const res = await fetch('/data/stations.json', { cache: 'no-store' });
    if (res.ok) {
      const master = await res.json();
      stationsByNameMap = window.COACH_stationsByName ? window.COACH_stationsByName(master) : {};
    }
  } catch { /* ignore */ }
}

async function loadLayout() {
  try {
    const res = await fetch('/data/station_layout.json', { cache: 'no-store' });
    if (res.ok) stationLayout = await res.json();
  } catch { /* ignore */ }
}

function showSessionStopped() {
  sessionStopped = true;
  $('board').innerHTML = `
    <div class="idle session-stopped">
      ${esc(t('sessionStopped'))}
      <button type="button" id="btnReconnect" class="reconnect">${esc(t('reconnect'))}</button>
    </div>`;
  const btn = $('btnReconnect');
  if (btn) btn.addEventListener('click', reconnectSession);
}

function reconnectSession() {
  sessionStopped = false;
  newSessionId();
  $('board').innerHTML = `<p class="loading">${esc(t('loading'))}</p>`;
  loadBoard();
}

async function loadBoard() {
  if (sessionStopped) return;
  const display = qs('display') || 'entrance-main';
  const sessionId = getSessionId();
  try {
    const res = await fetch(
      `${API_BASE}/api/coach-board?display=${encodeURIComponent(display)}&sessionId=${encodeURIComponent(sessionId)}`,
      {
        cache: 'no-store',
        headers: { 'X-Session-Id': sessionId, Accept: 'application/json' }
      }
    );
    const data = await res.json().catch(() => null);
    if (isSessionStoppedPayload(data) || (res.status === 409 && isSessionStoppedPayload(data))) {
      clearSessionId();
      showSessionStopped();
      return;
    }
    if (res.ok && data && (data.platforms || data.focus || data.stationBoard)) {
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
    if (data.platforms || data.focus || data.stationBoard) {
      if (data.display && display && data.display.id !== display) {
        data.display.id = display;
      }
      render(data);
      return;
    }
    throw new Error('Invalid static board fixture');
  } catch (err) {
    $('board').innerHTML = `<div class="idle">Unable to load: ${esc(err.message)}</div>`;
  }
}

if ($('bootLoading')) $('bootLoading').textContent = t('loading');
updateClock();
setInterval(updateClock, 1000);
setInterval(() => {
  if (sessionStopped) return;
  langIndex = (langIndex + 1) % languages.length;
  if (lastPayload) render(lastPayload);
  else updateClock();
}, LANG_MS);

Promise.all([loadTypes(), loadLayout(), loadStations()]).then(loadBoard);
setInterval(loadBoard, REFRESH_MS);
