'use strict';

/**
 * Live-board window: show coaches from T-showBefore until hideAfterDepart.
 * Uses HH:MM strings from mapped board trains (same style as PDS).
 */

function timeToMinutes(timeStr) {
  if (!timeStr || timeStr === '--') return null;
  const m = String(timeStr).match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function minutesUntil(timeStr, now = new Date()) {
  const event = timeToMinutes(timeStr);
  if (event === null) return null;
  const nowMins = now.getHours() * 60 + now.getMinutes();
  let diff = event - nowMins;
  if (diff < -720) diff += 1440;
  if (diff > 720) diff -= 1440;
  return diff;
}

/**
 * Pick primary train for a platform that is in the coach-display window.
 */
function pickTrainForPlatform(boardTrains, platform, showBeforeMinutes, hideAfterDepartMinutes, now = new Date()) {
  const pf = String(platform);
  const candidates = (boardTrains || []).filter((t) => String(t.platform) === pf);

  const scored = [];
  for (const t of candidates) {
    const arr = minutesUntil(t.expectedArrival || t.scheduledArrival, now);
    const dep = minutesUntil(t.expectedDeparture || t.scheduledDeparture, now);
    const atPlatform = t.runningState === 'arrived' || /arriv/i.test(t.status || '');
    const departed = t.runningState === 'departed' || /depart/i.test(t.status || '');

    let inWindow = false;
    let minutesUntilEvent = null;

    if (atPlatform && !departed) {
      inWindow = true;
      minutesUntilEvent = 0;
    } else if (departed) {
      const sinceDep = dep != null ? -dep : null;
      inWindow = sinceDep != null && sinceDep <= hideAfterDepartMinutes;
      minutesUntilEvent = dep;
    } else {
      const soonest = [arr, dep].filter((x) => x != null);
      const minPos = soonest.length ? Math.min(...soonest.map((x) => (x < 0 ? 9999 : x))) : null;
      if (minPos != null && minPos !== 9999 && minPos <= showBeforeMinutes) {
        inWindow = true;
        minutesUntilEvent = minPos;
      } else if (arr != null && arr < 0 && dep != null && dep >= -hideAfterDepartMinutes) {
        // Between arr and dep
        inWindow = true;
        minutesUntilEvent = dep;
      }
    }

    if (!inWindow) continue;

    scored.push({
      train: t,
      minutesUntil: minutesUntilEvent,
      priority: atPlatform ? 0 : departed ? 2 : 1
    });
  }

  scored.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return (a.minutesUntil ?? 999) - (b.minutesUntil ?? 999);
  });

  return scored[0] || null;
}

function nextOutsideWindow(boardTrains, platforms, showBeforeMinutes, hideAfterDepartMinutes, now = new Date()) {
  const shown = new Set();
  for (const pf of platforms) {
    const hit = pickTrainForPlatform(boardTrains, pf, showBeforeMinutes, hideAfterDepartMinutes, now);
    if (hit) shown.add(hit.train.trainNo);
  }

  let best = null;
  for (const t of boardTrains || []) {
    if (shown.has(t.trainNo)) continue;
    if (platforms.length && !platforms.includes(String(t.platform))) continue;
    const arr = minutesUntil(t.expectedArrival || t.scheduledArrival, now);
    const dep = minutesUntil(t.expectedDeparture || t.scheduledDeparture, now);
    const m = [arr, dep].filter((x) => x != null && x >= 0);
    if (!m.length) continue;
    const minutesUntilEvent = Math.min(...m);
    if (!best || minutesUntilEvent < best.minutesUntil) {
      best = {
        trainNo: t.trainNo,
        trainName: t.trainName,
        platform: String(t.platform),
        expectedArrival: t.expectedArrival || t.scheduledArrival || null,
        expectedDeparture: t.expectedDeparture || t.scheduledDeparture || null,
        minutesUntil: minutesUntilEvent
      };
    }
  }
  return best;
}

module.exports = {
  timeToMinutes,
  minutesUntil,
  pickTrainForPlatform,
  nextOutsideWindow
};
