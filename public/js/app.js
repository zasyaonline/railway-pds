'use strict';

/**
 * Charlapalli PDS — Frontend display controller.
 * Polls /api/trains when refresh is enabled.
 */

const CONFIG = window.PDS_CONFIG || {};
const API_BASE = CONFIG.API_BASE || '';
const REFRESH_MS_DEFAULT = CONFIG.REFRESH_MS || 30_000;

let refreshTimer = null;
let refreshIntervalMs = REFRESH_MS_DEFAULT;
let refreshEnabled = true;

// ---------------------------------------------------------------------------
// Clock
// ---------------------------------------------------------------------------

function updateClock() {
  const now = new Date();
  document.getElementById('clock').textContent = now.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  document.getElementById('clockDate').textContent = now.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

// ---------------------------------------------------------------------------
// Status styling
// ---------------------------------------------------------------------------

function getStatusClass(status) {
  const s = (status || '').toLowerCase();
  if (s.includes('cancel')) return 'status-cancelled';
  if (s.includes('arriv')) return 'status-arrived';
  if (s.includes('depart')) return 'status-departed';
  if (s.includes('late') || s.includes('delay')) return 'status-delayed';
  return 'status-on-time';
}

function formatTimeCell(expected, scheduled) {
  if (!expected && !scheduled) return '—';
  if (!expected || expected === scheduled) {
    return `<span class="time-expected">${expected || scheduled || '—'}</span>`;
  }
  return `
    <span class="time-expected">${expected}</span>
    <span class="time-scheduled">Sch: ${scheduled || '—'}</span>
  `;
}

function updateRefreshUI(enabled) {
  refreshEnabled = enabled;
  const statusEl = document.getElementById('refreshStatus');
  const btnStart = document.getElementById('btnStart');
  const btnStop = document.getElementById('btnStop');

  if (enabled) {
    statusEl.textContent = '● LIVE';
    statusEl.className = 'refresh-status live';
    btnStart.disabled = true;
    btnStop.disabled = false;
    scheduleRefresh();
  } else {
    statusEl.textContent = '● PAUSED';
    statusEl.className = 'refresh-status paused';
    btnStart.disabled = false;
    btnStop.disabled = true;
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function renderTable(trains) {
  const tbody = document.getElementById('trainBody');

  if (!trains || trains.length === 0) {
    tbody.innerHTML = `
      <tr class="no-trains">
        <td colspan="8">No upcoming trains at this time</td>
      </tr>`;
    return;
  }

  tbody.innerHTML = trains.map((t) => {
    const statusClass = getStatusClass(t.status);
    const isDelayed = t.delay > 0;
    const rowClass = isDelayed ? 'row-delayed' : '';

    return `
      <tr class="${rowClass}">
        <td class="train-no">${t.trainNo}</td>
        <td>${t.trainName}</td>
        <td>${t.from}</td>
        <td>${t.to}</td>
        <td>${formatTimeCell(t.expectedArrival, t.scheduledArrival)}</td>
        <td>${formatTimeCell(t.expectedDeparture, t.scheduledDeparture)}</td>
        <td><span class="platform-badge">${t.platform || '—'}</span></td>
        <td class="${statusClass}">${t.status}</td>
      </tr>`;
  }).join('');
}

function updateMeta(data) {
  if (data.stationName) {
    document.getElementById('stationName').textContent =
      `${data.stationName.toUpperCase()} RAILWAY STATION`;
  }
  if (data.stationCode) {
    document.getElementById('stationCode').textContent = data.stationCode;
  }
  if (data.lastUpdated) {
    document.getElementById('lastUpdated').textContent =
      new Date(data.lastUpdated).toLocaleString('en-IN');
  }
  if (data.refreshInterval) {
    document.getElementById('refreshInterval').textContent = data.refreshInterval;
    refreshIntervalMs = data.refreshInterval * 1000;
  }
  if (typeof data.refreshEnabled === 'boolean') {
    updateRefreshUI(data.refreshEnabled);
  }
  if (data.source) {
    const footer = document.querySelector('.footer');
    let srcEl = document.getElementById('dataSource');
    if (!srcEl) {
      srcEl = document.createElement('span');
      srcEl.id = 'dataSource';
      footer.insertBefore(srcEl, document.querySelector('.refresh-status'));
    }
    srcEl.textContent = `Source: ${data.source}`;
  }
}

// ---------------------------------------------------------------------------
// Data fetch
// ---------------------------------------------------------------------------

async function loadTrains() {
  try {
    const res = await fetch(`${API_BASE}/api/trains`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    renderTable(data.trains);
    updateMeta(data);
  } catch (err) {
    console.error('Failed to load trains:', err);
    if (refreshEnabled) {
      document.getElementById('trainBody').innerHTML = `
        <tr class="no-trains">
          <td colspan="8">Unable to load train data. Retrying…</td>
        </tr>`;
    }
  }
}

async function loadRefreshStatus() {
  try {
    const res = await fetch(`${API_BASE}/api/refresh/status`);
    if (res.ok) {
      const data = await res.json();
      updateRefreshUI(data.refreshEnabled !== false);
    }
  } catch {
    updateRefreshUI(true);
  }
}

async function setRefresh(action) {
  const btnStart = document.getElementById('btnStart');
  const btnStop = document.getElementById('btnStop');
  btnStart.disabled = true;
  btnStop.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/api/refresh/${action}`, { method: 'POST' });
    const data = await res.json();
    updateRefreshUI(data.refreshEnabled);
    if (data.refreshEnabled) {
      await loadTrains();
    }
  } catch (err) {
    console.error(`Failed to ${action} refresh:`, err);
    await loadRefreshStatus();
  }
}

function scheduleRefresh() {
  if (!refreshEnabled) return;
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(loadTrains, refreshIntervalMs);
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

document.getElementById('btnStart').addEventListener('click', () => setRefresh('start'));
document.getElementById('btnStop').addEventListener('click', () => setRefresh('stop'));

updateClock();
setInterval(updateClock, 1000);
loadRefreshStatus().then(loadTrains);
