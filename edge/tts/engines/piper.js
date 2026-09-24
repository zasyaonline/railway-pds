'use strict';

const fs = require('fs');
const path = require('path');
const { whichSync, runCommand } = require('./espeak');

/* IR PA profile.
   Voices: TE=venkatesh (male), HI=pratham (male), EN=lessac (neutral English —
   Pratham on English adds a Hindi accent on train names). */
const PIPER_PROFILE = 'ir-pa-v5-platform-pause';
const LENGTH_SCALE = process.env.ZASYA_PIPER_LENGTH_SCALE || '1.08';
/* Telugu digit runs need more dwell time than EN/HI. */
const LENGTH_SCALE_TE = process.env.ZASYA_PIPER_LENGTH_SCALE_TE || '1.22';
/* Slightly longer gap after "." so train number does not merge into platform. */
const SENTENCE_SILENCE = process.env.ZASYA_PIPER_SENTENCE_SILENCE || '0.55';
const HINDI_MALE = 'hi_IN-pratham-medium.onnx';
const ENGLISH_NEUTRAL = 'en_US-lessac-medium.onnx';
const TELUGU_MALE = 'te_IN-venkatesh-medium.onnx';

function modelsDir() {
  return process.env.ZASYA_PIPER_MODELS || path.join(
    process.env.ZASYA_RAILWAY_ROOT || '/var/lib/zasya/railway',
    'tts',
    'models'
  );
}

function modelCandidates(language) {
  const dir = modelsDir();
  const names = {
    en: [ENGLISH_NEUTRAL, 'en_GB-alan-medium.onnx', HINDI_MALE],
    hi: [HINDI_MALE],
    te: [TELUGU_MALE, 'te_IN-padmavathi-medium.onnx', 'te_IN.onnx']
  };
  return (names[language] || names.en).map((name) => path.join(dir, name));
}

function modelFor(language) {
  return modelCandidates(language).find((p) => fs.existsSync(p)) || '';
}

function lengthScaleFor(language) {
  if (String(language || '').startsWith('te')) return LENGTH_SCALE_TE;
  return LENGTH_SCALE;
}

function piperBin() {
  const envBin = process.env.ZASYA_PIPER_BIN;
  if (envBin && fs.existsSync(envBin)) return envBin;
  const bundled = '/opt/zasya/piper/piper';
  if (fs.existsSync(bundled)) return bundled;
  return whichSync('piper');
}

async function synthesizePiper({ text, language, voice, outPath, timeoutMs }) {
  const bin = piperBin();
  if (!bin || !fs.existsSync(bin)) return { ok: false, error: 'piper binary not found' };
  const modelPath = voice && fs.existsSync(voice) ? voice : modelFor(language);
  if (!modelPath || !fs.existsSync(modelPath)) {
    return { ok: false, error: `piper model missing for ${language}` };
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const scale = lengthScaleFor(language);
  const args = [
    '--model', modelPath,
    '--output_file', outPath,
    '--length_scale', String(scale),
    '--sentence_silence', String(SENTENCE_SILENCE)
  ];
  let result = await runCommand(bin, args, {
    input: text,
    timeoutMs
  });
  if (!result.ok && /length_scale|sentence_silence|unrecognized|unknown argument/i.test(result.error || '')) {
    result = await runCommand(bin, ['--model', modelPath, '--output_file', outPath], {
      input: text,
      timeoutMs
    });
  }
  if (!result.ok) return result;
  return { ok: true, engine: 'piper', voice: path.basename(modelPath), outPath, profile: PIPER_PROFILE };
}

module.exports = { synthesizePiper, piperBin, modelFor, PIPER_PROFILE, lengthScaleFor };
