'use strict';

const CONFIG = window.PDS_CONFIG || {};
const API_BASE = CONFIG.API_BASE || '';
const KEY_STORAGE = 'pds_admin_key';
const CUSTOM_VALUE = '__custom__';

let adminKey = '';
let pollTimer = null;
let stationPresets = [];
let stationFormDirty = false;
let stationFormReady = false;
let platformDirty = {};
let platformPollInFlight = false;
let announceModalTrain = null;

const ANNOUNCE_TYPE_LABELS = {
  arriving: 'Arriving',
  departing: 'Departing',
  delayed: 'Delayed',
  approaching: 'Arriving',
  boarding: 'Boarding',
  platform_changed: 'Platform changed',
  cancelled: 'Cancelled',
  rescheduled: 'Rescheduled',
  special: 'Special',
  greeting: 'Greeting',
  advisory: 'Advisory',
  departed: 'Departing',
  live: 'Live mic',
  manual: 'Manual text'
};

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function minutesUntilClock(timeStr, now = new Date()) {
  if (!timeStr) return null;
  const m = String(timeStr).match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const target = Number(m[1]) * 60 + Number(m[2]);
  const current = now.getHours() * 60 + now.getMinutes();
  let diff = target - current;
  if (diff < -720) diff += 1440;
  return diff;
}

function suggestedAnnounceType(train, now = new Date()) {
  const running = String(train?.runningState || '').toLowerCase();
  const status = String(train?.status || '');
  const delay = Number(train?.delay || 0);
  if (running === 'cancelled' || /cancel/i.test(status)) return 'cancelled';
  if (running === 'departed') return 'departing';
  if (running === 'arrived') return 'arriving';
  if (delay >= 15) return 'delayed';
  const mins = minutesUntilClock(train?.scheduledArrival || train?.expectedArrival, now);
  if (mins != null && mins >= 0 && mins <= 30) return 'arriving';
  return 'arriving';
}

function trainStatusSummary(train) {
  const bits = [
    train.status || '—',
    train.runningState ? `state ${train.runningState}` : '',
    Number(train.delay) > 0 ? `delay ${train.delay} min` : '',
    `PF ${train.platform || train.ntesPlatform || '—'}`,
    train.expectedArrival ? `ETA ${train.expectedArrival}` : ''
  ].filter(Boolean);
  return bits.join(' · ');
}

function closeAnnounceModal() {
  announceModalTrain = null;
  const modal = $('announceTrainModal');
  if (modal) modal.hidden = true;
}

function openAnnounceModal(train) {
  if (!$('announceTrainModal')) return;
  announceModalTrain = train;
  const suggested = suggestedAnnounceType(train);
  $('announceModalTitle').textContent = `Announce ${train.trainNo}`;
  $('announceModalStatus').textContent =
    `${train.trainName || '—'} · ${trainStatusSummary(train)} · suggested: ${ANNOUNCE_TYPE_LABELS[suggested] || suggested}`;
  $('announceModalType').value = suggested;
  $('announceModalExtra').value = '';
  $('announceTrainModal').hidden = false;
  $('announceModalType').focus();
}

async function speakTrainAnnouncement(train, type, extra) {
  const mins = minutesUntilClock(train.expectedArrival || train.scheduledArrival);
  const data = await api('/api/admin/announcements/manual', {
    method: 'POST',
    body: JSON.stringify({
      type,
      trainNo: train.trainNo,
      trainName: train.trainName,
      platform: train.platform || train.ntesPlatform,
      delay: train.delay,
      status: train.status,
      runningState: train.runningState,
      extra: extra || '',
      minutes: mins != null && mins >= 0 ? mins : undefined
    })
  });
  renderAnnouncements(data);
  setAnnounceStatus(`Queued ${ANNOUNCE_TYPE_LABELS[type] || type} for ${train.trainNo}`);
  closeAnnounceModal();
}

function $(id) {
  return document.getElementById(id);
}

function isStationFormFocused() {
  const active = document.activeElement;
  return active === $('stationCodeInput')
    || active === $('stationNameInput')
    || active === $('stationPreset');
}

function markStationDirty() {
  stationFormDirty = true;
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
    const err = new Error(data.message || data.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

function fillStationPresets(presets) {
  const next = presets || [];
  const same = next.length === stationPresets.length
    && next.every((s, i) => s.code === stationPresets[i]?.code && s.name === stationPresets[i]?.name);
  stationPresets = next;
  if (same && $('stationPreset').options.length > 0) {
    return;
  }

  const select = $('stationPreset');
  const previous = select.value;
  select.innerHTML = stationPresets
    .map((s) => `<option value="${s.code}">${s.code} — ${s.name}</option>`)
    .join('') + `<option value="${CUSTOM_VALUE}">Other / custom code…</option>`;
  if (previous && [...select.options].some((o) => o.value === previous)) {
    select.value = previous;
  }
}

function showResolvedPreview(code, name, names) {
  const el = $('stationResolved');
  if (!code) {
    el.hidden = true;
    return;
  }
  const parts = [`Resolved: ${name || '—'} (${code})`];
  if (names?.te) parts.push(`TE: ${names.te}`);
  if (names?.hi) parts.push(`HI: ${names.hi}`);
  el.textContent = parts.join(' · ');
  el.hidden = false;
}

function updateDisplayLinks(stationCode) {
  const code = (stationCode || $('stationCodeInput')?.value || 'BG').trim().toUpperCase() || 'BG';
  const coach = $('linkCoachDisplay');
  if (coach) {
    coach.href = `/coach/?station=${encodeURIComponent(code)}&display=entrance-main`;
  }
}

function syncStationForm(code, name, force, names) {
  $('currentStation').textContent = code ? `${code}` : '—';
  if (name) {
    $('currentStation').title = name;
  }
  updateDisplayLinks(code);
  showResolvedPreview(code, name, names);

  if (!force && (stationFormDirty || isStationFormFocused())) {
    return;
  }

  const preset = stationPresets.find((s) => s.code === code);
  if (preset) {
    $('stationPreset').value = code;
    $('stationCodeInput').value = code;
    $('stationNameInput').value = name || preset.name;
  } else {
    $('stationPreset').value = CUSTOM_VALUE;
    $('stationCodeInput').value = code || '';
    $('stationNameInput').value = name || '';
  }
  stationFormDirty = false;
  stationFormReady = true;
}

function onPresetChange() {
  markStationDirty();
  const value = $('stationPreset').value;
  if (value === CUSTOM_VALUE) {
    $('stationCodeInput').focus();
    return;
  }
  const preset = stationPresets.find((s) => s.code === value);
  if (!preset) return;
  $('stationCodeInput').value = preset.code;
  $('stationNameInput').value = preset.name;
  showResolvedPreview(preset.code, preset.name, {
    te: preset.te,
    hi: preset.hi
  });
}

function setStationStatus(message, isError) {
  const el = $('stationStatus');
  el.hidden = !message;
  el.textContent = message || '';
  el.className = `station-status${isError ? ' error' : ''}`;
}

function setAnnounceStatus(message, isError) {
  const el = $('announceStatus');
  if (!el) return;
  el.hidden = !message;
  el.textContent = message || '';
  el.className = `station-status${isError ? ' error' : ''}`;
}

function renderPendingPlatform(data) {
  const box = $('pendingPlatformBox');
  if (!box) return;
  const rows = data.pendingPlatform || [];
  if (!rows.length) {
    box.hidden = true;
    box.innerHTML = '';
    return;
  }
  box.hidden = false;
  box.innerHTML = rows.map((row) => `
    <p>
      Platform change pending: train ${escapeHtml(row.trainNo)} ${escapeHtml(row.from)} → ${escapeHtml(row.to)}
      <button type="button" class="btn-refresh btn-start btn-confirm-pf" data-train="${escapeHtml(row.trainNo)}">Confirm and announce</button>
    </p>
  `).join('');
  box.querySelectorAll('.btn-confirm-pf').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        const data = await api('/api/admin/announcements/confirm-platform', {
          method: 'POST',
          body: JSON.stringify({ trainNo: btn.dataset.train })
        });
        renderAnnouncements(data);
        setAnnounceStatus(`Confirmed platform for ${btn.dataset.train}`);
      } catch (err) {
        setAnnounceStatus(err.message, true);
      }
    });
  });
}

function renderAnnouncements(data) {
  if ($('announceState')) {
    $('announceState').textContent =
      `${data.engineState || '—'} · Auto ${data.autoEnabled ? 'ON' : 'OFF'} · Paused ${data.paused ? 'YES' : 'no'} · Queue ${data.queueLength || 0}` +
      (data.heldLength ? ` · held ${data.heldLength}` : '') +
      (data.recording ? ' · LIVE MIC' : '') +
      (data.ntesUnavailable ? ' · NTES unavailable' : '') +
      (data.lastError ? ` · last error: ${data.lastError}` : '');
  }
  renderPendingPlatform(data);
  const tbody = $('announceBody');
  if (!tbody) return;
  const rows = data.history || [];
  if (!rows.length) {
    tbody.innerHTML = `<tr class="no-trains"><td colspan="5">No announcement history</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map((e) => {
    const preview = e.transcript || e.spoken?.en || '';
    const short = preview.length > 90 ? `${preview.slice(0, 87)}…` : preview;
    const result = e.ok
      ? (short ? `ok · ${escapeHtml(short)}` : 'ok')
      : escapeHtml(e.error || 'fail');
    return `
    <tr>
      <td>${e.at ? new Date(e.at).toLocaleTimeString('en-IN') : '—'}</td>
      <td>${escapeHtml(e.type || '—')}</td>
      <td>${escapeHtml(e.trainNo || '—')}</td>
      <td title="${escapeHtml(preview)}">${result}</td>
      <td>
        <button type="button" class="btn-refresh btn-start btn-announce-replay" data-id="${escapeHtml(e.id)}">Replay</button>
      </td>
    </tr>`;
  }).join('');
  tbody.querySelectorAll('.btn-announce-replay').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        const data = await api('/api/admin/announcements/replay', {
          method: 'POST',
          body: JSON.stringify({ id: btn.dataset.id })
        });
        setAnnounceStatus(
          data.result?.fromCache ? 'Replaying saved audio' : `Queued replay ${btn.dataset.id}`
        );
        await loadAnnouncements();
      } catch (err) {
        setAnnounceStatus(err.message, true);
        btn.disabled = false;
      }
    });
  });
}

async function loadAnnouncements() {
  if (!$('announceBody')) return;
  const data = await api('/api/admin/announcements');
  renderAnnouncements(data);
}

function lockStationEditor() {
  document.body.classList.add('station-locked');
  const btn = $('btnApplyStation');
  if (btn) {
    btn.disabled = true;
    btn.hidden = true;
  }
  const preset = $('stationPreset');
  if (preset) preset.disabled = true;
  const code = $('stationCodeInput');
  if (code) {
    code.readOnly = true;
    code.disabled = true;
  }
  const pinHelp = $('stationPinnedHelp');
  if (pinHelp) pinHelp.hidden = false;
}

function renderSessions(data) {
  $('activeCount').textContent = String(data.activeCount ?? 0);
  $('refreshState').textContent = data.refreshEnabled ? 'LIVE' : 'PAUSED';
  $('refreshState').className = `stat-value ${data.refreshEnabled ? 'live' : 'paused'}`;

  if (data.stationPinned || $('licenceChip')) {
    lockStationEditor();
  }

  if (Array.isArray(data.stationPresets) && data.stationPresets.length) {
    fillStationPresets(data.stationPresets);
  }
  if (data.stationCode) {
    syncStationForm(data.stationCode, data.stationName, !stationFormReady, data.stationNames);
  }

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

function renderPlatforms(data) {
  const tbody = $('platformBody');
  const trains = data.trains || [];
  if (!trains.length) {
    tbody.innerHTML = `<tr class="no-trains"><td colspan="5">No trains on the current board</td></tr>`;
    return;
  }

  const focused = document.activeElement;
  const focusedTrain = focused && focused.dataset && focused.dataset.train
    ? focused.dataset.train
    : null;

  tbody.innerHTML = trains.map((t) => {
    const dirtyVal = platformDirty[t.trainNo];
    const value = dirtyVal != null
      ? dirtyVal
      : (t.platformOverridden ? t.platform : '');
    const mark = t.platformOverridden ? ' <span class="pf-overridden">override</span>' : '';
    const status = escapeHtml(t.status || t.runningState || '—');
    return `
      <tr>
        <td class="train-no">
          <button type="button" class="btn-mic" data-train="${escapeHtml(t.trainNo)}" title="Announce ${escapeHtml(t.trainNo)}" aria-label="Announce train ${escapeHtml(t.trainNo)}">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"/></svg>
          </button>
          ${escapeHtml(t.trainNo)}
        </td>
        <td>${escapeHtml(t.trainName || '—')}</td>
        <td class="train-status">${status}</td>
        <td>${escapeHtml(t.ntesPlatform || '—')}${mark}</td>
        <td class="override-cell">
          <div class="pf-edit">
            <input
              class="pf-input"
              data-train="${escapeHtml(t.trainNo)}"
              type="text"
              maxlength="4"
              placeholder="PF"
              value="${String(value).replace(/"/g, '&quot;')}"
              autocomplete="off"
            >
            <button type="button" class="btn-refresh btn-start btn-pf-save" data-train="${escapeHtml(t.trainNo)}">OK</button>
            <button type="button" class="btn-refresh btn-stop btn-pf-clear" data-train="${escapeHtml(t.trainNo)}">Clear</button>
          </div>
        </td>
      </tr>`;
  }).join('');

  tbody.querySelectorAll('.pf-input').forEach((input) => {
    input.addEventListener('input', () => {
      platformDirty[input.dataset.train] = input.value;
    });
    input.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter') return;
      ev.preventDefault();
      const save = tbody.querySelector(`.btn-pf-save[data-train="${input.dataset.train}"]`);
      save?.click();
    });
    if (focusedTrain && input.dataset.train === focusedTrain) {
      input.focus();
      const len = input.value.length;
      input.setSelectionRange(len, len);
    }
  });

  tbody.querySelectorAll('.btn-pf-save').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const trainNo = btn.dataset.train;
      const input = tbody.querySelector(`.pf-input[data-train="${trainNo}"]`);
      const platform = (input?.value || '').trim();
      if (!platform) {
        setPlatformStatus('Enter a platform number before OK', true);
        return;
      }
      btn.disabled = true;
      try {
        await api('/api/admin/platforms', {
          method: 'POST',
          body: JSON.stringify({ trainNo, platform })
        });
        delete platformDirty[trainNo];
        setPlatformStatus(`Saved PF ${platform} for ${trainNo}`);
        await loadPlatforms();
      } catch (err) {
        setPlatformStatus(err.message, true);
        btn.disabled = false;
      }
    });
  });

  tbody.querySelectorAll('.btn-pf-clear').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const trainNo = btn.dataset.train;
      btn.disabled = true;
      try {
        await api('/api/admin/platforms/clear', {
          method: 'POST',
          body: JSON.stringify({ trainNo })
        });
        delete platformDirty[trainNo];
        setPlatformStatus(`Cleared override for ${trainNo}`);
        await loadPlatforms();
      } catch (err) {
        setPlatformStatus(err.message, true);
        btn.disabled = false;
      }
    });
  });

  tbody.querySelectorAll('.btn-mic').forEach((btn) => {
    btn.addEventListener('click', () => {
      const train = trains.find((row) => String(row.trainNo) === String(btn.dataset.train));
      if (train) openAnnounceModal(train);
    });
  });
}

async function loadSessions() {
  const data = await api('/api/admin/sessions');
  renderSessions(data);
}

async function loadPlatforms() {
  if (platformPollInFlight) return;
  platformPollInFlight = true;
  try {
    const data = await api('/api/admin/platforms');
    renderPlatforms(data);
  } finally {
    platformPollInFlight = false;
  }
}

async function loadApplianceStatus() {
  const licenceEl = $('licenceChip');
  if (!licenceEl) return;
  try {
    const status = await api('/api/admin/status');
    licenceEl.textContent = status.licenceState || status.licence || '—';
    const lic = String(status.licenceState || status.licence || '').toUpperCase();
    licenceEl.className = `stat-value ${lic === 'VALID' ? 'live' : 'paused'}`;
    if ($('ntesChip')) {
      const ntes = status.ntes || '—';
      $('ntesChip').textContent = String(ntes).toUpperCase();
      $('ntesChip').className = `stat-value ${ntes === 'connected' ? 'live' : 'paused'}`;
    }
    if (status.ntes === 'connected' && $('refreshState')) {
      $('refreshState').textContent = 'LIVE';
      $('refreshState').className = 'stat-value live';
    }
  } catch {
    /* cloud PDS has no /api/admin/status */
  }
}

async function applyStation() {
  if (document.body.classList.contains('station-locked')) {
    setStationStatus('Station identity is locked for this installation', true);
    return;
  }
  const stationCode = $('stationCodeInput').value.trim();
  const btn = $('btnApplyStation');
  btn.disabled = true;
  setStationStatus('Validating with NTES…');
  try {
    const result = await api('/api/admin/station', {
      method: 'POST',
      body: JSON.stringify({ stationCode })
    });
    setStationStatus(result.message || 'Station updated');
    stationFormDirty = false;
    await loadSessions();
    syncStationForm(result.stationCode, result.stationName, true, result.stationNames);
    await loadPlatforms();
  } catch (err) {
    setStationStatus(err.status === 403
      ? (err.message || 'Station is locked to this installation licence')
      : err.message, true);
  } finally {
    if (!$('stationCodeInput').readOnly) btn.disabled = false;
  }
}

async function unlock() {
  adminKey = $('adminKey').value.trim();
  $('gateError').hidden = true;
  try {
    await loadSessions();
    await loadPlatforms();
    await loadAnnouncements();
    try {
      sessionStorage.setItem(KEY_STORAGE, adminKey);
    } catch {
      /* ignore */
    }
    $('gate').hidden = true;
    $('panel').hidden = false;
    await loadApplianceStatus();
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => {
      loadSessions().catch(() => {});
      loadApplianceStatus().catch(() => {});
      loadAnnouncements().catch(() => {});
      const active = document.activeElement;
      const editingPf = active && active.classList && active.classList.contains('pf-input');
      const announceOpen = $('announceTrainModal') && !$('announceTrainModal').hidden;
      const rulesOpen = $('announceRulesModal') && !$('announceRulesModal').hidden;
      if (!editingPf && !announceOpen && !rulesOpen) {
        loadPlatforms().catch(() => {});
      }
    }, 5000);
  } catch (err) {
    $('gateError').textContent = err.status === 401
      ? 'Invalid admin key'
      : err.status === 404
        ? 'Admin API not loaded (HTTP 404). On the PC run: sudo systemctl restart nginx zasya-railway-admin zasya-railway-platform'
        : err.message;
    $('gateError').hidden = false;
  }
}

$('btnUnlock').addEventListener('click', unlock);
$('adminKey').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') unlock();
});

$('stationPreset').addEventListener('change', onPresetChange);
$('btnApplyStation').addEventListener('click', applyStation);
$('stationCodeInput').addEventListener('input', markStationDirty);
$('stationCodeInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    applyStation();
  }
});
$('stationCodeInput').addEventListener('input', () => {
  $('stationCodeInput').value = $('stationCodeInput').value.toUpperCase();
  const code = $('stationCodeInput').value.trim();
  const preset = stationPresets.find((s) => s.code === code);
  $('stationPreset').value = preset ? code : CUSTOM_VALUE;
  if (preset) {
    $('stationNameInput').value = preset.name;
    showResolvedPreview(preset.code, preset.name, { te: preset.te, hi: preset.hi });
  } else {
    $('stationNameInput').value = '';
    showResolvedPreview(code, null, null);
  }
});

$('btnRefreshList').addEventListener('click', () => {
  Promise.all([loadSessions(), loadPlatforms()]).catch((e) => alert(e.message));
});
$('btnRefreshPlatforms').addEventListener('click', () => {
  loadPlatforms().catch((e) => alert(e.message));
});
$('btnClearAllPlatforms').addEventListener('click', async () => {
  if (!confirm('Clear all platform overrides?')) return;
  try {
    await api('/api/admin/platforms/clear', {
      method: 'POST',
      body: JSON.stringify({ all: true })
    });
    platformDirty = {};
    setPlatformStatus('All platform overrides cleared');
    await loadPlatforms();
  } catch (err) {
    setPlatformStatus(err.message, true);
  }
});

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
    await loadPlatforms();
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

async function announceCommand(path, body) {
  try {
    const data = await api(path, { method: 'POST', body: JSON.stringify(body || {}) });
    renderAnnouncements(data);
    setAnnounceStatus('Updated');
  } catch (err) {
    setAnnounceStatus(err.message, true);
  }
}

if ($('btnAnnounceEnable')) {
  $('btnAnnounceEnable').addEventListener('click', () => announceCommand('/api/admin/announcements/auto', { enabled: true }));
  $('btnAnnounceDisable').addEventListener('click', () => announceCommand('/api/admin/announcements/auto', { enabled: false }));
  $('btnAnnouncePause').addEventListener('click', () => announceCommand('/api/admin/announcements/pause', { paused: true }));
  $('btnAnnounceResume').addEventListener('click', () => announceCommand('/api/admin/announcements/pause', { paused: false }));
  if ($('btnAnnounceStop')) {
    $('btnAnnounceStop').addEventListener('click', () => announceCommand('/api/admin/announcements/stop', {}));
  }
  if ($('btnAnnounceClear')) {
    $('btnAnnounceClear').addEventListener('click', () => announceCommand('/api/admin/announcements/clear', {}));
  }
  if ($('btnLiveStart')) {
    $('btnLiveStart').addEventListener('click', async () => {
      try {
        const data = await api('/api/admin/announcements/live/start', { method: 'POST', body: '{}' });
        renderAnnouncements(data);
        setAnnounceStatus(data.recording ? 'Live microphone recording' : 'Live start');
      } catch (err) {
        setAnnounceStatus(err.message, true);
      }
    });
  }
  if ($('btnLiveStop')) {
    $('btnLiveStop').addEventListener('click', async () => {
      try {
        const data = await api('/api/admin/announcements/live/stop', {
          method: 'POST',
          body: JSON.stringify({ transcript: $('announceExtra')?.value.trim() || '' })
        });
        renderAnnouncements(data);
        setAnnounceStatus('Live clip queued to PA');
      } catch (err) {
        setAnnounceStatus(err.message, true);
      }
    });
  }
  $('btnAnnounceSpeak').addEventListener('click', async () => {
    try {
      const data = await api('/api/admin/announcements/manual', {
        method: 'POST',
        body: JSON.stringify({
          type: $('announceType').value,
          trainNo: $('announceTrain').value.trim(),
          platform: $('announcePlatform').value.trim(),
          extra: $('announceExtra').value.trim()
        })
      });
      renderAnnouncements(data);
      setAnnounceStatus('Queued');
    } catch (err) {
      setAnnounceStatus(err.message, true);
    }
  });
}

if ($('btnAnnounceModalClose')) {
  $('btnAnnounceModalClose').addEventListener('click', closeAnnounceModal);
  $('announceTrainModal').addEventListener('click', (ev) => {
    if (ev.target === $('announceTrainModal')) closeAnnounceModal();
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && $('announceTrainModal') && !$('announceTrainModal').hidden) {
      closeAnnounceModal();
    }
    if (ev.key === 'Escape' && $('announceRulesModal') && !$('announceRulesModal').hidden) {
      $('announceRulesModal').hidden = true;
    }
  });
  $('btnAnnounceModalCurrent').addEventListener('click', async () => {
    if (!announceModalTrain) return;
    try {
      await speakTrainAnnouncement(
        announceModalTrain,
        suggestedAnnounceType(announceModalTrain),
        $('announceModalExtra').value.trim()
      );
    } catch (err) {
      setAnnounceStatus(err.message, true);
    }
  });
  $('btnAnnounceModalSpeak').addEventListener('click', async () => {
    if (!announceModalTrain) return;
    try {
      await speakTrainAnnouncement(
        announceModalTrain,
        $('announceModalType').value,
        $('announceModalExtra').value.trim()
      );
    } catch (err) {
      setAnnounceStatus(err.message, true);
    }
  });
}

function period(settings, id) {
  return (settings.volume?.periods || []).find((p) => p.id === id) || {};
}

function fillRulesForm(envelope) {
  const s = envelope.settings || {};
  $('announceRulesMeta').textContent =
    `${envelope.stationCode || '—'} · ${envelope.source || 'defaults'} · schema ${envelope.schemaVersion || '—'}` +
    (envelope.updatedAt ? ` · saved ${new Date(envelope.updatedAt).toLocaleString('en-IN')}` : '');
  $('ruleLanguageOrder').value = (s.languageOrder || []).join(',');
  $('ruleArrivalStart').value = s.arrival?.startMinutes ?? 30;
  $('ruleWinFar').value = s.arrival?.windows?.[0]?.intervalMinutes ?? 3;
  $('ruleWinNear').value = s.arrival?.windows?.[1]?.intervalMinutes ?? 5;
  $('ruleShortMins').value = s.arrival?.shortNoticeMinutes ?? 5;
  $('ruleShortCount').value = s.arrival?.shortNoticeCount ?? 2;
  $('ruleDelayMin').value = s.delay?.minMinutes ?? 15;
  $('ruleDelayMode').value = s.delay?.mode || 'first_only';
  $('ruleDelayStep').value = s.delay?.stepMinutes ?? 15;
  $('ruleDepartMins').value = s.departure?.minutesBefore ?? 10;
  $('ruleStale').value = s.staleNtes || 'stop';
  $('rulePfConfirm').checked = s.platformChange?.requireStaffConfirm !== false;
  $('ruleCancelAuto').checked = s.cancelled?.auto !== false;
  $('ruleReschedAuto').checked = s.rescheduled?.auto !== false;
  const day = period(s, 'day');
  const eve = period(s, 'evening');
  const night = period(s, 'night');
  $('ruleDayStart').value = day.start || '06:00';
  $('ruleDayEnd').value = day.end || '18:00';
  $('ruleDayDb').value = day.db ?? 85;
  $('ruleEveStart').value = eve.start || '18:00';
  $('ruleEveEnd').value = eve.end || '22:00';
  $('ruleEveDb').value = eve.db ?? 75;
  $('ruleNightStart').value = night.start || '22:00';
  $('ruleNightEnd').value = night.end || '06:00';
  $('ruleNightDb').value = night.db ?? 70;
  $('ruleSink').value = s.audio?.sink || 'default';
  $('ruleCapture').value = s.audio?.capture || 'default';
  $('ruleIdle').value = s.advisory?.idleSeconds ?? 120;
  $('ruleClips').value = JSON.stringify(s.advisory?.clips || [], null, 2);
  $('ruleTemplates').value = JSON.stringify(s.templates || {}, null, 2);
}

function collectRulesForm() {
  let clips = [];
  let templates = undefined;
  try {
    clips = JSON.parse($('ruleClips').value || '[]');
  } catch {
    throw new Error('Advisory clips must be valid JSON');
  }
  try {
    templates = JSON.parse($('ruleTemplates').value || '{}');
  } catch {
    throw new Error('Templates must be valid JSON');
  }
  return {
    languageOrder: $('ruleLanguageOrder').value.split(',').map((s) => s.trim()).filter(Boolean),
    arrival: {
      startMinutes: Number($('ruleArrivalStart').value),
      windows: [
        { fromMinutes: 30, toMinutes: 15, intervalMinutes: Number($('ruleWinFar').value) },
        { fromMinutes: 15, toMinutes: 0, intervalMinutes: Number($('ruleWinNear').value) }
      ],
      shortNoticeMinutes: Number($('ruleShortMins').value),
      shortNoticeCount: Number($('ruleShortCount').value)
    },
    delay: {
      minMinutes: Number($('ruleDelayMin').value),
      mode: $('ruleDelayMode').value,
      stepMinutes: Number($('ruleDelayStep').value)
    },
    departure: { minutesBefore: Number($('ruleDepartMins').value) },
    staleNtes: $('ruleStale').value,
    platformChange: { requireStaffConfirm: $('rulePfConfirm').checked, auto: false },
    cancelled: { auto: $('ruleCancelAuto').checked },
    rescheduled: { auto: $('ruleReschedAuto').checked },
    volume: {
      mode: 'time_of_day',
      periods: [
        { id: 'day', start: $('ruleDayStart').value, end: $('ruleDayEnd').value, db: Number($('ruleDayDb').value) },
        { id: 'evening', start: $('ruleEveStart').value, end: $('ruleEveEnd').value, db: Number($('ruleEveDb').value) },
        { id: 'night', start: $('ruleNightStart').value, end: $('ruleNightEnd').value, db: Number($('ruleNightDb').value) }
      ]
    },
    audio: { sink: $('ruleSink').value.trim() || 'default', capture: $('ruleCapture').value.trim() || 'default' },
    advisory: { idleSeconds: Number($('ruleIdle').value), clips },
    templates
  };
}

function setRulesStatus(message, isError) {
  const el = $('announceRulesStatus');
  if (!el) return;
  el.hidden = !message;
  el.textContent = message || '';
  el.className = `station-status${isError ? ' error' : ''}`;
}

if ($('btnAnnounceRules')) {
  $('btnAnnounceRules').addEventListener('click', async () => {
    try {
      const data = await api('/api/admin/announcements/settings');
      fillRulesForm(data);
      setRulesStatus('');
      $('announceRulesModal').hidden = false;
    } catch (err) {
      setAnnounceStatus(err.message, true);
    }
  });
  $('btnRulesClose').addEventListener('click', () => {
    $('announceRulesModal').hidden = true;
  });
  $('announceRulesModal').addEventListener('click', (ev) => {
    if (ev.target === $('announceRulesModal')) $('announceRulesModal').hidden = true;
  });
  $('btnRulesSave').addEventListener('click', async () => {
    try {
      const settings = collectRulesForm();
      const data = await api('/api/admin/announcements/settings', {
        method: 'PUT',
        body: JSON.stringify({ settings })
      });
      fillRulesForm(data);
      setRulesStatus(`Saved overlay for ${data.stationCode}`);
    } catch (err) {
      setRulesStatus(err.message, true);
    }
  });
  $('btnRulesReset').addEventListener('click', async () => {
    if (!confirm('Restore PDF defaults for this station?')) return;
    try {
      const data = await api('/api/admin/announcements/settings/reset', { method: 'POST', body: '{}' });
      fillRulesForm(data);
      setRulesStatus('Restored defaults');
    } catch (err) {
      setRulesStatus(err.message, true);
    }
  });
}

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
