'use strict';

/**
 * Map NTES coach codes → typeId using coach_types.json codeRules.
 */

function matchRule(code, rule) {
  const raw = String(code || '').trim().toUpperCase();
  const m = String(rule.match || '');
  if (m.startsWith('re:')) {
    try {
      return new RegExp(m.slice(3), 'i').test(raw);
    } catch {
      return false;
    }
  }
  return raw === m.toUpperCase();
}

function resolveTypeId(code, typesDoc) {
  const fallback = typesDoc.fallbackTypeId || 'unknown';
  const rules = typesDoc.codeRules || [];
  for (const rule of rules) {
    if (matchRule(code, rule)) return rule.typeId || fallback;
  }
  return fallback;
}

function mapComposition(codes, typesDoc) {
  const list = Array.isArray(codes) ? codes : [];
  return list.map((code, i) => {
    const c = String(code || '').trim().toUpperCase() || `C${i + 1}`;
    const typeId = resolveTypeId(c, typesDoc);
    return {
      seq: i + 1,
      code: c,
      typeId,
      label: c
    };
  });
}

function resolveYouAreHere(youAreHere, coaches, bogieLengthMeters) {
  if (!youAreHere || !youAreHere.platform) {
    return {
      enabled: false,
      slotIndex: null,
      metersFromEngineEnd: null,
      alignedCoachCode: null,
      facing: youAreHere?.facing || 'engine_left'
    };
  }

  const bogie = bogieLengthMeters || 25;
  let slotIndex =
    typeof youAreHere.slotIndex === 'number'
      ? youAreHere.slotIndex
      : Math.round((Number(youAreHere.metersFromEngineEnd) || 0) / bogie);

  if (coaches.length) {
    slotIndex = Math.max(0, Math.min(coaches.length - 1, slotIndex));
  } else {
    slotIndex = null;
  }

  return {
    enabled: true,
    slotIndex,
    metersFromEngineEnd:
      typeof youAreHere.metersFromEngineEnd === 'number'
        ? youAreHere.metersFromEngineEnd
        : slotIndex != null
          ? slotIndex * bogie
          : null,
    alignedCoachCode: slotIndex != null && coaches[slotIndex] ? coaches[slotIndex].code : null,
    facing: youAreHere.facing || 'engine_left'
  };
}

module.exports = {
  resolveTypeId,
  mapComposition,
  resolveYouAreHere
};
