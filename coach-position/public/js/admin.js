'use strict';

const API_BASE = (window.COACH_CONFIG && window.COACH_CONFIG.API_BASE) || '';
const KEY_STORAGE = 'coach_admin_key';
let adminKey = '';
let doc = null;

function $(id) { return document.getElementById(id); }

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

function renderList() {
  $('stationCode').textContent = doc.stationCode || '—';
  const list = $('list');
  list.innerHTML = (doc.displays || []).map((d) => `
    <div class="card" data-id="${d.id}">
      <strong>${d.id}</strong> — ${d.name}<br>
      <span style="color:#94a3b8">${d.mode} · PF ${(d.platformsShown || []).join(',')}
      ${d.youAreHere ? ` · pin PF${d.youAreHere.platform} @ ${d.youAreHere.metersFromEngineEnd ?? d.youAreHere.slotIndex}m` : ''}</span>
    </div>
  `).join('') || '<p>No displays yet</p>';

  list.querySelectorAll('.card').forEach((el) => {
    el.addEventListener('click', () => {
      const d = doc.displays.find((x) => x.id === el.dataset.id);
      if (!d) return;
      $('fId').value = d.id;
      $('fName').value = d.name || '';
      $('fMode').value = d.mode || 'dual';
      $('fPlatforms').value = (d.platformsShown || []).join(',');
      $('fPinPf').value = d.youAreHere?.platform || '';
      $('fMetres').value = d.youAreHere?.metersFromEngineEnd ?? '';
      $('fFacing').value = d.youAreHere?.facing || 'engine_left';
      $('previewLink').href = `/?display=${encodeURIComponent(d.id)}`;
    });
  });
}

async function unlock() {
  adminKey = $('adminKey').value.trim();
  $('gateError').hidden = true;
  try {
    doc = await api('/api/admin/displays');
    sessionStorage.setItem(KEY_STORAGE, adminKey);
    $('gate').hidden = true;
    $('panel').hidden = false;
    renderList();
  } catch (err) {
    $('gateError').textContent = err.status === 401 ? 'Invalid admin key' : err.message;
    $('gateError').hidden = false;
  }
}

$('btnUnlock').addEventListener('click', unlock);
$('adminKey').addEventListener('keydown', (e) => { if (e.key === 'Enter') unlock(); });

$('btnSave').addEventListener('click', async () => {
  const status = $('status');
  status.hidden = true;
  try {
    const platforms = $('fPlatforms').value.split(',').map((s) => s.trim()).filter(Boolean);
    const pinPf = $('fPinPf').value.trim();
    const metres = $('fMetres').value === '' ? undefined : Number($('fMetres').value);
    const display = {
      id: $('fId').value.trim(),
      name: $('fName').value.trim(),
      mode: $('fMode').value,
      platformsShown: platforms,
      youAreHere: pinPf
        ? {
            platform: pinPf,
            metersFromEngineEnd: metres,
            facing: $('fFacing').value
          }
        : undefined
    };
    const result = await api('/api/admin/displays', {
      method: 'POST',
      body: JSON.stringify({ display })
    });
    doc.displays = result.displays;
    renderList();
    status.textContent = 'Saved';
    status.hidden = false;
    $('previewLink').href = `/?display=${encodeURIComponent(display.id)}`;
  } catch (err) {
    status.textContent = err.message;
    status.style.color = '#f87171';
    status.hidden = false;
  }
});

try {
  const saved = sessionStorage.getItem(KEY_STORAGE);
  if (saved) {
    $('adminKey').value = saved;
    unlock();
  }
} catch { /* ignore */ }
