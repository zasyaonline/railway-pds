'use strict';

function minutesUntil(timeStr, now = new Date()) {
  if (!timeStr) return null;
  const m = String(timeStr).match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const target = Number(m[1]) * 60 + Number(m[2]);
  const current = now.getHours() * 60 + now.getMinutes();
  let diff = target - current;
  if (diff < -720) diff += 1440;
  return diff;
}

function parseClockMinutes(value) {
  const m = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function inClockWindow(now, start, end) {
  const cur = now.getHours() * 60 + now.getMinutes();
  const s = parseClockMinutes(start);
  const e = parseClockMinutes(end);
  if (s == null || e == null) return false;
  if (s === e) return true;
  if (s < e) return cur >= s && cur < e;
  return cur >= s || cur < e;
}

function volumeForNow(config, now = new Date()) {
  if (config?.volume?.mode !== 'time_of_day') {
    return Number(config?.volume?.default || 80);
  }
  const periods = config.volume.periods || [];
  const gain = config.volume.dbToGain || { 85: 100, 75: 80, 70: 60 };
  for (const period of periods) {
    if (inClockWindow(now, period.start, period.end)) {
      const db = Number(period.db);
      const mapped = gain[db] ?? gain[String(db)];
      if (mapped != null) return Number(mapped);
      return Number(config.volume.default || 80);
    }
  }
  return Number(config.volume.default || 80);
}

function nightQuiet(config, now = new Date()) {
  const start = config.suppress?.nightStart;
  const end = config.suppress?.nightEnd;
  if (start == null || end == null) return false;
  return inClockWindow(now, start, end);
}

function platformUnknown(train) {
  const p = String(train?.platform || '').trim();
  return !p || p === '-' || p === '0';
}

function isCancelled(train) {
  const running = String(train?.runningState || '').toLowerCase();
  const status = String(train?.status || '');
  return running === 'cancelled' || /cancel/i.test(status);
}

function shouldSuppress(train, config, now) {
  if (nightQuiet(config, now)) return true;
  if (config.suppress?.cancelled && isCancelled(train)) return true;
  if (config.suppress?.diverted && /divert/i.test(train?.status || '')) return true;
  if (config.suppress?.platformUnknown && platformUnknown(train)) return true;
  return false;
}

function suggestedManualType(train, now = new Date(), config = {}) {
  const running = String(train?.runningState || '').toLowerCase();
  const delayMin = Number(config.delay?.minMinutes || 15);
  if (isCancelled(train)) return 'cancelled';
  if (running === 'departed') return 'departing';
  if (running === 'arrived') return 'arriving';
  if (Number(train?.delay || 0) >= delayMin) return 'delayed';
  const mins = minutesUntil(train?.scheduledArrival, now);
  if (mins != null && mins >= 0 && mins <= Number(config.arrival?.startMinutes || 30)) return 'arriving';
  return 'arriving';
}

function enabledType(config, type) {
  return (config.enabledTypes || []).includes(type);
}

function memoryKey(trainNo, type) {
  return `${trainNo}:${type}`;
}

function already(memory, trainNo, type) {
  return Boolean(memory.done?.[memoryKey(trainNo, type)]);
}

function mark(memory, trainNo, type, extra = {}) {
  memory.done = memory.done || {};
  memory.done[memoryKey(trainNo, type)] = { at: new Date().toISOString(), ...extra };
}

function delayShouldFire(train, config, memory) {
  const min = Number(config.delay?.minMinutes || 15);
  const delay = Number(train.delay || 0);
  if (delay < min) return false;
  const prev = memory.delayAnnounced?.[train.trainNo];
  const mode = config.delay?.mode || 'first_only';
  if (prev == null) return true;
  if (mode === 'first_only') return false;
  const step = Number(config.delay?.stepMinutes || 15);
  return delay >= Number(prev) + step;
}

function arrivalIntervalMinutes(mins, config) {
  const windows = config.arrival?.windows || [];
  for (const window of windows) {
    const hi = Number(window.fromMinutes);
    const lo = Number(window.toMinutes);
    if (lo === 0 && mins <= hi && mins >= 0) return Number(window.intervalMinutes);
    if (mins <= hi && mins > lo) return Number(window.intervalMinutes);
  }
  return null;
}

function arrivalSta(train) {
  return train?.scheduledArrival || null;
}

function departureStd(train) {
  return train?.scheduledDeparture || null;
}

function dueArrivalCadence(train, config, memory, now) {
  if (!enabledType(config, 'arriving')) return null;
  if (train.runningState === 'departed') return null;
  const mins = minutesUntil(arrivalSta(train), now);
  const start = Number(config.arrival?.startMinutes || 30);
  if (mins == null || mins < 0 || mins > start) {
    if (config.triggers?.arrivingWhenArrived !== false && train.runningState === 'arrived' && !already(memory, train.trainNo, 'arrivingAtPlatform')) {
      return { type: 'arriving', minutes: 0, atPlatform: true };
    }
    return null;
  }
  const rec = memory.arrival?.[train.trainNo];
  const shortLimit = Number(config.arrival?.shortNoticeMinutes || 5);
  const shortCount = Number(config.arrival?.shortNoticeCount || 2);
  const isNew = !rec;
  const shortNotice = Boolean(rec?.shortNotice) || (isNew && mins < shortLimit);
  if (shortNotice) {
    const fires = rec?.fires?.length || 0;
    if (fires >= shortCount) return null;
    if (fires === 0) return { type: 'arriving', minutes: mins, shortNotice: true };
    const discovered = rec.discoveredAt ? new Date(rec.discoveredAt).getTime() : now.getTime();
    const remainingMs = Math.max(30_000, Number(rec.discoveredMinutes || mins) * 60_000);
    if (now.getTime() - discovered >= remainingMs / 2) {
      return { type: 'arriving', minutes: mins, shortNotice: true };
    }
    return null;
  }
  const interval = arrivalIntervalMinutes(mins, config);
  if (interval == null) return null;
  if (!rec?.lastFireAt) return { type: 'arriving', minutes: mins };
  const elapsedMin = (now.getTime() - new Date(rec.lastFireAt).getTime()) / 60000;
  if (elapsedMin + 0.001 >= interval) return { type: 'arriving', minutes: mins };
  return null;
}

function dueDeparting(train, config, memory, now) {
  if (!enabledType(config, 'departing')) return false;
  if (train.runningState === 'departed' || isCancelled(train)) return false;
  if (already(memory, train.trainNo, 'departing') && !config.departure?.repeat) return false;
  const mins = minutesUntil(departureStd(train), now);
  const before = Number(config.departure?.minutesBefore || 10);
  return mins != null && mins >= 0 && mins <= before;
}

function evaluateTrain(train, config, memory, now) {
  const events = [];
  const pending = [];
  if (!train?.trainNo) return { events, pending };
  if (isCancelled(train)) {
    if (
      enabledType(config, 'cancelled') &&
      !config.suppress?.cancelled &&
      config.cancelled?.auto !== false &&
      !config.cancelled?.requireStaffConfirm &&
      !already(memory, train.trainNo, 'cancelled')
    ) {
      events.push({ type: 'cancelled', trainNo: train.trainNo, train });
    }
    return { events, pending };
  }
  if (shouldSuppress(train, config, now)) return { events, pending };

  const prevSched = memory.schedule?.[train.trainNo];
  if (prevSched && enabledType(config, 'rescheduled')) {
    const sta = arrivalSta(train) || '';
    const std = departureStd(train) || '';
    if ((prevSched.sta && sta && prevSched.sta !== sta) || (prevSched.std && std && prevSched.std !== std)) {
      if (
        config.rescheduled?.auto !== false &&
        !config.rescheduled?.requireStaffConfirm &&
        !already(memory, train.trainNo, 'rescheduled')
      ) {
        events.push({ type: 'rescheduled', trainNo: train.trainNo, train });
      }
    }
  }

  if (enabledType(config, 'platform_changed')) {
    const lastPf = memory.platform?.[train.trainNo];
    const nextPf = train.platform && train.platform !== '-' ? String(train.platform) : '';
    if (lastPf && nextPf && lastPf !== nextPf) {
      const pendingRow = {
        trainNo: train.trainNo,
        from: lastPf,
        to: nextPf,
        train
      };
      if (config.platformChange?.requireStaffConfirm !== false && !config.platformChange?.auto) {
        pending.push(pendingRow);
      } else if (!already(memory, train.trainNo, 'platform_changed')) {
        events.push({ type: 'platform_changed', trainNo: train.trainNo, train });
      }
    }
  }

  if (enabledType(config, 'delayed') && delayShouldFire(train, config, memory)) {
    events.push({ type: 'delayed', trainNo: train.trainNo, train });
  }

  const arrival = dueArrivalCadence(train, config, memory, now);
  if (arrival) {
    events.push({
      type: 'arriving',
      trainNo: train.trainNo,
      train,
      minutes: arrival.minutes,
      shortNotice: Boolean(arrival.shortNotice),
      atPlatform: Boolean(arrival.atPlatform)
    });
  }

  if (dueDeparting(train, config, memory, now)) {
    events.push({
      type: 'departing',
      trainNo: train.trainNo,
      train,
      minutes: minutesUntil(departureStd(train), now)
    });
  }

  return { events, pending };
}

function applyMemory(events, pending, memory, trains, now) {
  memory.done = memory.done || {};
  memory.delayAnnounced = memory.delayAnnounced || {};
  memory.platform = memory.platform || {};
  memory.schedule = memory.schedule || {};
  memory.arrival = memory.arrival || {};
  memory.pendingPlatform = memory.pendingPlatform || {};

  for (const train of trains || []) {
    if (!train?.trainNo) continue;
    if (!memory.schedule[train.trainNo]) {
      memory.schedule[train.trainNo] = {
        sta: arrivalSta(train) || '',
        std: departureStd(train) || ''
      };
    }
    if (train.platform && train.platform !== '-' && !memory.platform[train.trainNo] && !memory.pendingPlatform[train.trainNo]) {
      memory.platform[train.trainNo] = String(train.platform);
    }
    const mins = minutesUntil(arrivalSta(train), now);
    if (mins != null && mins >= 0 && mins <= 180 && !memory.arrival[train.trainNo]) {
      memory.arrival[train.trainNo] = {
        discoveredAt: now.toISOString(),
        discoveredMinutes: mins,
        shortNotice: mins < 5,
        fires: [],
        lastFireAt: null
      };
    }
  }

  for (const row of pending || []) {
    const existing = memory.pendingPlatform[row.trainNo];
    if (!existing || existing.to !== row.to) {
      memory.pendingPlatform[row.trainNo] = {
        from: row.from,
        to: row.to,
        at: now.toISOString()
      };
    }
  }

  for (const ev of events) {
    if (ev.type === 'arriving') {
      const rec = memory.arrival[ev.trainNo] || {
        discoveredAt: now.toISOString(),
        discoveredMinutes: ev.minutes,
        shortNotice: Boolean(ev.shortNotice),
        fires: [],
        lastFireAt: null
      };
      rec.fires = rec.fires || [];
      rec.fires.push({ at: now.toISOString(), minutes: ev.minutes });
      rec.lastFireAt = now.toISOString();
      rec.shortNotice = rec.shortNotice || Boolean(ev.shortNotice);
      memory.arrival[ev.trainNo] = rec;
      if (ev.atPlatform) mark(memory, ev.trainNo, 'arrivingAtPlatform');
    } else if (ev.type === 'delayed') {
      mark(memory, ev.trainNo, ev.type);
      memory.delayAnnounced[ev.trainNo] = Number(ev.train.delay || 0);
    } else if (ev.type === 'platform_changed') {
      mark(memory, ev.trainNo, ev.type);
      if (ev.train?.platform && ev.train.platform !== '-') {
        memory.platform[ev.trainNo] = String(ev.train.platform);
      }
      delete memory.pendingPlatform[ev.trainNo];
    } else if (ev.type === 'rescheduled') {
      mark(memory, ev.trainNo, ev.type);
      memory.schedule[ev.trainNo] = {
        sta: arrivalSta(ev.train) || '',
        std: departureStd(ev.train) || ''
      };
    } else {
      mark(memory, ev.trainNo, ev.type);
    }
  }
  return memory;
}

function trackPlatforms(trains, memory) {
  memory.platform = memory.platform || {};
  for (const train of trains || []) {
    if (train?.trainNo && train.platform && train.platform !== '-' && !memory.platform[train.trainNo]) {
      memory.platform[train.trainNo] = String(train.platform);
    }
  }
  return memory;
}

function rankingIndex(config, type) {
  const ranking = config.priority?.ranking || [];
  const idx = ranking.indexOf(type);
  return idx === -1 ? 99 : idx;
}

function isManualSource(job) {
  return job?.source === 'manual' || job?.source === 'live';
}

function compareJobs(a, b, config) {
  if (isManualSource(a) && !isManualSource(b) && config.priority?.manualOverAuto !== false) return -1;
  if (isManualSource(b) && !isManualSource(a) && config.priority?.manualOverAuto !== false) return 1;
  return rankingIndex(config, a.type) - rankingIndex(config, b.type);
}

function cloneMap(obj, nestedFires = false) {
  const out = {};
  for (const [key, value] of Object.entries(obj || {})) {
    if (value && typeof value === 'object') {
      out[key] = { ...value };
      if (nestedFires && Array.isArray(value.fires)) out[key].fires = value.fires.slice();
    } else {
      out[key] = value;
    }
  }
  return out;
}

function cloneMemory(memory) {
  return {
    done: { ...(memory.done || {}) },
    delayAnnounced: { ...(memory.delayAnnounced || {}) },
    platform: { ...(memory.platform || {}) },
    schedule: cloneMap(memory.schedule),
    arrival: cloneMap(memory.arrival, true),
    pendingPlatform: cloneMap(memory.pendingPlatform)
  };
}

function evaluateBoard({ trains, config, memory, now, stale }) {
  const nextMemory = cloneMemory(memory || {});
  if (stale && config.staleNtes === 'stop') {
    return { events: [], pending: [], memory: nextMemory, ntesUnavailable: true };
  }
  trackPlatforms(trains, nextMemory);
  const events = [];
  const pending = [];
  const clock = now || new Date();
  for (const train of trains || []) {
    const result = evaluateTrain(train, config, nextMemory, clock);
    events.push(...result.events);
    pending.push(...result.pending);
  }
  applyMemory(events, pending, nextMemory, trains, clock);
  return { events, pending, memory: nextMemory, ntesUnavailable: false };
}

function confirmPlatformChange(memory, trainNo, train) {
  const pending = memory.pendingPlatform?.[trainNo];
  if (!pending) return { ok: false, error: 'no pending platform change' };
  const next = cloneMemory(memory);
  next.pendingPlatform = { ...(memory.pendingPlatform || {}) };
  delete next.pendingPlatform[trainNo];
  const mergedTrain = { ...(train || {}), trainNo, platform: pending.to };
  const event = { type: 'platform_changed', trainNo, train: mergedTrain };
  applyMemory([event], [], next, [mergedTrain], new Date());
  return { ok: true, event, memory: next, from: pending.from, to: pending.to };
}

module.exports = {
  minutesUntil,
  shouldSuppress,
  suggestedManualType,
  evaluateTrain,
  evaluateBoard,
  compareJobs,
  trackPlatforms,
  volumeForNow,
  confirmPlatformChange,
  arrivalIntervalMinutes
};
