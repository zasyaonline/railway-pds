'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { ttsCacheDir } = require('../../shared/paths');
const { synthesizeEspeak, ESPEAK_PROFILE } = require('./engines/espeak');
const { synthesizePiper, piperBin, modelFor, PIPER_PROFILE } = require('./engines/piper');

const DEFAULT_TIMEOUT_MS = 60000;

function cacheKey({ engine, language, voice, text, profile }) {
  return crypto
    .createHash('sha256')
    .update([engine, language, voice || '', profile || '', text].join('\0'))
    .digest('hex');
}

function preferPiper(language) {
  const bin = piperBin();
  const model = modelFor(language);
  return Boolean(bin && fs.existsSync(bin) && model && fs.existsSync(model));
}

function resolveEngine(language, requested) {
  if (requested === 'espeak') return 'espeak';
  if (requested === 'piper') return 'piper';
  return preferPiper(language) ? 'piper' : 'espeak';
}

/**
 * synthesize(text, language, voice) -> WAV
 * TTS must not know about trains, NTES, or announcement rules.
 */
async function synthesize(text, language, voice, options = {}) {
  const lang = String(language || 'en').slice(0, 8);
  const body = String(text || '').trim();
  if (!body) return { ok: false, error: 'text required', failOpen: true };
  const engine = resolveEngine(lang, options.engine);
  const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);
  const key = cacheKey({
    engine,
    language: lang,
    voice: voice || '',
    text: body,
    profile: engine === 'espeak' ? ESPEAK_PROFILE : (engine === 'piper' ? PIPER_PROFILE : '')
  });
  const outPath = options.outPath || path.join(ttsCacheDir(), `${key}.wav`);
  if (!options.skipCache && fs.existsSync(outPath) && fs.statSync(outPath).size > 44) {
    return { ok: true, cached: true, engine, language: lang, outPath };
  }
  try {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
  } catch (err) {
    return { ok: false, error: err.message, failOpen: true };
  }
  const started = Date.now();
  let result;
  try {
    if (engine === 'piper') {
      result = await synthesizePiper({ text: body, language: lang, voice, outPath, timeoutMs });
      if (!result.ok && options.engine !== 'piper') {
        result = await synthesizeEspeak({ text: body, language: lang, voice, outPath, timeoutMs });
      }
    } else {
      result = await synthesizeEspeak({ text: body, language: lang, voice, outPath, timeoutMs });
    }
  } catch (err) {
    return { ok: false, error: err.message, failOpen: true, engine, language: lang };
  }
  if (!result.ok) {
    return { ...result, failOpen: true, engine, language: lang };
  }
  try {
    if (!fs.existsSync(outPath) || fs.statSync(outPath).size <= 44) {
      return { ok: false, error: 'wav missing', failOpen: true, engine, language: lang };
    }
  } catch (err) {
    return { ok: false, error: err.message, failOpen: true, engine, language: lang };
  }
  return {
    ok: true,
    cached: false,
    engine: result.engine || engine,
    voice: result.voice || voice || null,
    language: lang,
    outPath,
    elapsedMs: Date.now() - started
  };
}

module.exports = { synthesize, resolveEngine, cacheKey };
