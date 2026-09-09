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

function nightQuiet(config, now = new Date()) {
  const start = config.suppress?.nightStart;
  const end = config.suppress?.nightEnd;
  if (start == null || end == null) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  const s = Number(String(start).split(':')[0]) * 60 + Number(String(start).split(':')[1] || 0);
  const e = Number(String(end).split(':')[0]) * 60 + Number(String(end).split(':')[1] || 0);
  if (s <= e) return cur >= s && cur < e;
  return cur >= s || cur < e;
}

function platformUnknown(train) {
  const p = String(train?.platform || '').trim();
  return !p || p === '-' || p === '0';
}

function shouldSuppress(train, config, now) {
  if (nightQuiet(config, now)) return true;
  const status = String(train?.status || '');
  const running = String(train?.runningState || '');
  if (config.suppress?.cancelled && (running === 'cancelled' || /cancel/i.test(status))) {
    return true;
  }
  if (config.suppress?.diverted && /divert/i.test(status)) return true;
  if (config.suppress?.platformUnknown && platformUnknown(train)) return true;
  return false;
}

function suggestedManualType(train, now = new Date()) {
  const running = String(train?.runningState || '').toLowerCase();
  const status = String(train?.status || '');
  const delay = Number(train?.delay || 0);
  if (running === 'cancelled' || /cancel/i.test(status)) return 'cancelled';
  if (running === 'departed') return 'departed';
  if (running === 'arrived') return 'arriving';
  if (delay >= 15) return 'delayed';
  const mins = minutesUntil(train?.expectedArrival || train?.scheduledArrival, now);
  if (mins != null && mins >= 0 && mins <= 15) return 'approaching';
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
  const mode = config.delay?.mode || 'first_then_step';
  if (!prev) return true;
  if (mode === 'first_only') return false;
  const step = Number(config.delay?.stepMinutes || 15);
  return delay >= prev + step;
}

function evaluateTrain(train, config, memory, now) {
  const events = [];
  if (!train?.trainNo) return events;
  const cancelled = train.runningState === 'cancelled' || /cancel/i.test(train.status || '');
  if (cancelled) {
    if (
      enabledType(config, 'cancelled') &&
      !config.suppress?.cancelled &&
      !already(memory, train.trainNo, 'cancelled')
    ) {
      events.push({ type: 'cancelled', trainNo: train.trainNo, train });
    }
    return events;
  }
  if (shouldSuppress(train, config, now)) return events;

  if (enabledType(config, 'platform_changed') && !config.platformChange?.requireStaffConfirm) {
    const lastPf = memory.platform?.[train.trainNo];
    if (lastPf && train.platform && train.platform !== '-' && lastPf !== train.platform) {
      if (!already(memory, train.trainNo, 'platform_changed')) {
        events.push({ type: 'platform_changed', trainNo: train.trainNo, train });
      }
    }
  }

  if (enabledType(config, 'delayed') && delayShouldFire(train, config, memory)) {
    events.push({ type: 'delayed', trainNo: train.trainNo, train });
  }

  if (enabledType(config, 'arriving') && config.triggers?.arrivingWhenArrived !== false) {
    if (train.runningState === 'arrived' && !already(memory, train.trainNo, 'arriving')) {
      events.push({ type: 'arriving', trainNo: train.trainNo, train });
    }
  }

  if (enabledType(config, 'departed') && config.triggers?.departedWhenDeparted !== false) {
    if (train.runningState === 'departed' && !already(memory, train.trainNo, 'departed')) {
      events.push({ type: 'departed', trainNo: train.trainNo, train });
    }
  }

  if (enabledType(config, 'approaching') && train.runningState === 'scheduled') {
    const mins = minutesUntil(train.expectedArrival || train.scheduledArrival, now);
    const window = Number(config.triggers?.approachingMinutes || 15);
    if (mins != null && mins >= 0 && mins <= window && !already(memory, train.trainNo, 'approaching')) {
      events.push({ type: 'approaching', trainNo: train.trainNo, train, minutes: mins });
    }
  }

  return events;
}

function applyMemory(events, memory) {
  for (const ev of events) {
    mark(memory, ev.trainNo, ev.type);
    if (ev.type === 'delayed') {
      memory.delayAnnounced = memory.delayAnnounced || {};
      memory.delayAnnounced[ev.trainNo] = Number(ev.train.delay || 0);
    }
    if (ev.train?.platform && ev.train.platform !== '-') {
      memory.platform = memory.platform || {};
      memory.platform[ev.trainNo] = ev.train.platform;
    }
  }
  return memory;
}

function trackPlatforms(trains, memory) {
  memory.platform = memory.platform || {};
  for (const train of trains || []) {
    if (train?.trainNo && train.platform && train.platform !== '-' && !memory.platform[train.trainNo]) {
      memory.platform[train.trainNo] = train.platform;
    }
  }
  return memory;
}

function rankingIndex(config, type) {
  const ranking = config.priority?.ranking || [];
  const idx = ranking.indexOf(type);
  return idx === -1 ? 99 : idx;
}

function compareJobs(a, b, config) {
  if (a.source === 'manual' && b.source !== 'manual' && config.priority?.manualOverAuto !== false) {
    return -1;
  }
  if (b.source === 'manual' && a.source !== 'manual' && config.priority?.manualOverAuto !== false) {
    return 1;
  }
  return rankingIndex(config, a.type) - rankingIndex(config, b.type);
}

function evaluateBoard({ trains, config, memory, now, stale }) {
  const nextMemory = {
    done: { ...(memory.done || {}) },
    delayAnnounced: { ...(memory.delayAnnounced || {}) },
    platform: { ...(memory.platform || {}) }
  };
  if (stale && config.staleNtes === 'stop') {
    return { events: [], memory: nextMemory };
  }
  trackPlatforms(trains, nextMemory);
  const events = [];
  for (const train of trains || []) {
    events.push(...evaluateTrain(train, config, nextMemory, now));
  }
  applyMemory(events, nextMemory);
  return { events, memory: nextMemory };
}

module.exports = {
  minutesUntil,
  shouldSuppress,
  suggestedManualType,
  evaluateTrain,
  evaluateBoard,
  compareJobs,
  trackPlatforms
};
