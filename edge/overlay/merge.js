'use strict';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clone(value) {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(clone);
  if (isPlainObject(value)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = clone(v);
    return out;
  }
  return value;
}

function mergeOverlay(base, overlay) {
  if (overlay === undefined) return clone(base);
  if (overlay === null) return null;
  if (base == null) return clone(overlay);
  if (Array.isArray(overlay)) return overlay.map(clone);
  if (!isPlainObject(overlay) || !isPlainObject(base)) return clone(overlay);
  const out = clone(base);
  for (const [key, value] of Object.entries(overlay)) {
    if (value === null) {
      delete out[key];
      continue;
    }
    out[key] = mergeOverlay(base[key], value);
  }
  return out;
}

module.exports = { mergeOverlay, clone, isPlainObject };
