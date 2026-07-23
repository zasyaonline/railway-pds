'use strict';

const CONFIG = window.PDS_CONFIG || {};
const API_BASE = CONFIG.API_BASE || '';
const KEY_STORAGE = 'pds_admin_key';

let adminKey = '';
let pollTimer = null;

function $(id) {
  return document.getElementById(id);
}

function updateClock() {
  $('clock').textContent = new Date().toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

function formatDuration(totalSeconds) {
  const s = Math.max(0, Number(totalSeconds) || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function shortId(id) {
  if (!id) return '—';
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

function browserLabel(ua) {
  if (!ua) return '—';
  if (/Edg\//.test(ua)) return 'Edge';
  if (/Chrome\//.test(ua)) return 'Chrome';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return 'Safari';
  return ua.slice(0, 40);
}

async function api(path, options = {}) {
  const headers = Object.assign(
    { 'Content-Type': 'application/json', 'X-Admin-Key': adminKey },
    options.headers || {}
  );
  const sep = path.includes('?') ? '&' : '?';
  const url = `${API_BASE}${path}${sep}adminKey=${encodeURIComponent(adminKey)}`;
  const res = await fetch(url, Object.assign({}, options, { headers }));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

function renderSessions(data) {
  $('activeCount').textContent = String(data.activeCount ?? 0);
  $('refreshState').textContent = data.refreshEnabled ? 'LIVE' : 'PAUSED';
  $('refreshState').className = `stat-value ${data.refreshEnabled ? 'live' : 'paused'}`;

  const tbody = $('sessionBody');
  const sessions = data.sessions || [];
  if (!sessions.length) {
    tbody.innerHTML = `<tr class="no-trains"><td colspan="6">No active sessions</td></tr>`;
    return;
  }

  tbody.innerHTML = sessions.map((s) => `
    <tr>
      <td><code title="${s.id}">${shortId(s.id)}</code></td>
      <td>${new Date(s.startedAt).toLocaleString('en-IN')}</td>
      <td><strong>${formatDuration(s.durationSeconds)}</strong></td>
      <td>${formatDuration(s.idleSeconds)} ago</td>
      <td>${browserLabel(s.userAgent)}</td>
      <td><button type="button" class="btn-refresh btn-stop btn-stop-one" data-id="${s.id}">Stop</button></td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.btn-stop-one').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await api('/api/admin/sessions/stop', {
          method: 'POST',
          body: JSON.stringify({ sessionId: btn.dataset.id })
        });
        await loadSessions();
      } catch (err) {
        alert(err.message);
        btn.disabled = false;
      }
    });
  });
}

async function loadSessions() {
  const data = await api('/api/admin/sessions');
  renderSessions(data);
}

async function unlock() {
  adminKey = $('adminKey').value.trim();
  $('gateError').hidden = true;
  try {
    await loadSessions();
    try {
      sessionStorage.setItem(KEY_STORAGE, adminKey);
    } catch {
      /* ignore */
    }
    $('gate').hidden = true;
    $('panel').hidden = false;
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => {
      loadSessions().catch(() => {});
    }, 5000);
  } catch (err) {
    $('gateError').textContent = err.status === 401 ? 'Invalid admin key' : err.message;
    $('gateError').hidden = false;
  }
}

$('btnUnlock').addEventListener('click', unlock);
$('adminKey').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') unlock();
});

$('btnRefreshList').addEventListener('click', () => loadSessions().catch((e) => alert(e.message)));
$('btnStopAll').addEventListener('click', async () => {
  if (!confirm('Stop all active display sessions?')) return;
  try {
    await api('/api/admin/sessions/stop-all', { method: 'POST', body: '{}' });
    await loadSessions();
  } catch (err) {
    alert(err.message);
  }
});

$('btnServiceStart').addEventListener('click', async () => {
  try {
    await api('/api/refresh/start', { method: 'POST', body: '{}' });
    await loadSessions();
  } catch (err) {
    alert(err.message);
  }
});

$('btnServiceStop').addEventListener('click', async () => {
  try {
    await api('/api/refresh/stop', { method: 'POST', body: '{}' });
    await loadSessions();
  } catch (err) {
    alert(err.message);
  }
});

updateClock();
setInterval(updateClock, 1000);

try {
  const saved = sessionStorage.getItem(KEY_STORAGE);
  if (saved) {
    $('adminKey').value = saved;
    unlock();
  }
} catch {
  /* ignore */
}
