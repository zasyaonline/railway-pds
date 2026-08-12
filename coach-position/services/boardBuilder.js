'use strict';

const { mapComposition, resolveYouAreHere } = require('./coachMapper');
const { pickTrainForPlatform, nextOutsideWindow } = require('./windowService');
const { fetchTrainComposition } = require('./compositionService');

/**
 * Build /api/coach-board payload for a display profile.
 */
async function buildCoachBoard({
  displaysDoc,
  typesDoc,
  displayId,
  boardTrains,
  compositionCache,
  useNtes
}) {
  const display =
    (displaysDoc.displays || []).find((d) => d.id === displayId) ||
    (displaysDoc.displays || [])[0];

  if (!display) {
    return { error: 'display_not_found', status: 404 };
  }

  const showBefore = displaysDoc.showBeforeMinutes ?? 10;
  const hideAfter = displaysDoc.hideAfterDepartMinutes ?? 15;
  const bogie = displaysDoc.bogieLengthMeters ?? 25;
  const platformsShown = display.platformsShown || [];
  const cache = compositionCache || {};

  const platforms = [];
  for (const pf of platformsShown) {
    const picked = pickTrainForPlatform(boardTrains || [], pf, showBefore, hideAfter);
    const pinForThisPf =
      display.youAreHere && String(display.youAreHere.platform) === String(pf)
        ? display.youAreHere
        : null;

    if (!picked) {
      platforms.push({
        platform: String(pf),
        inWindow: false,
        train: null,
        compositionAvailable: false,
        coaches: [],
        youAreHere: resolveYouAreHere(pinForThisPf, [], bogie),
        nextLabel: null
      });
      continue;
    }

    const t = picked.train;
    let codes = cache[t.trainNo];
    let source = 'cache';
    if (!codes) {
      const fetched = await fetchTrainComposition(t.trainNo, { useNtes });
      codes = fetched.codes;
      source = fetched.source;
    }

    const coaches = mapComposition(codes, typesDoc);
    const youAreHere = resolveYouAreHere(
      pinForThisPf
        ? { ...pinForThisPf, facing: pinForThisPf.facing || display.youAreHere?.facing }
        : null,
      coaches,
      bogie
    );
    if (!pinForThisPf) {
      youAreHere.enabled = false;
    }

    platforms.push({
      platform: String(pf),
      inWindow: true,
      train: {
        trainNo: t.trainNo,
        trainName: t.trainName,
        platform: String(t.platform),
        expectedArrival: t.expectedArrival || t.scheduledArrival || null,
        expectedDeparture: t.expectedDeparture || t.scheduledDeparture || null,
        minutesUntil: picked.minutesUntil
      },
      compositionAvailable: coaches.length > 0,
      coaches,
      compositionSource: source,
      youAreHere,
      nextLabel: null
    });
  }

  const anyInWindow = platforms.some((p) => p.inWindow);
  const body = {
    stationCode: displaysDoc.stationCode,
    stationName: displaysDoc.stationName || displaysDoc.stationCode,
    generatedAt: new Date().toISOString(),
    showBeforeMinutes: showBefore,
    hideAfterDepartMinutes: hideAfter,
    bogieLengthMeters: bogie,
    languages: displaysDoc.languages || ['en', 'te', 'hi'],
    display: {
      id: display.id,
      name: display.name,
      mode: display.mode,
      platformsShown,
      facing: display.youAreHere?.facing || 'engine_left'
    },
    platforms
  };

  if (!anyInWindow) {
    body.idle = {
      message: 'No train in coach-display window',
      nextTrain: nextOutsideWindow(boardTrains || [], platformsShown, showBefore, hideAfter)
    };
  }

  return { ok: true, body };
}

module.exports = { buildCoachBoard };
