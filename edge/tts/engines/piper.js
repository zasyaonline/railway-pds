'use strict';

const fs = require('fs');
const path = require('path');
const { whichSync, runCommand } = require('./espeak');

/* IR PA profile: slightly slower than conversation; longer gaps between sentences. */
const PIPER_PROFILE = 'ir-pa-v1';
const LENGTH_SCALE = process.env.ZASYA_PIPER_LENGTH_SCALE || '1.08';
const SENTENCE_SILENCE = process.env.ZASYA_PIPER_SENTENCE_SILENCE || '0.40';

function modelsDir() {
  return process.env.ZASYA_PIPER_MODELS || path.join(
    process.env.ZASYA_RAILWAY_ROOT || '/var/lib/zasya/railway',
    'tts',
    'models'
  );
}

function modelCandidates(language) {
  const dir = modelsDir();
  /* Telugu: prefer female PA-style (padmavathi) when installed; else venkatesh. */
  const names = {
    en: ['en_US-lessac-medium.onnx', 'en_GB-alan-medium.onnx'],
    hi: ['hi_IN-pratham-medium.onnx'],
    te: ['te_IN-padmavathi-medium.onnx', 'te_IN-venkatesh-medium.onnx', 'te_IN.onnx']
  };
  return (names[language] || names.en).map((name) => path.join(dir, name));
}

function modelFor(language) {
  return modelCandidates(language).find((p) => fs.existsSync(p)) || '';
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
  const args = [
    '--model', modelPath,
    '--output_file', outPath,
    '--length_scale', String(LENGTH_SCALE),
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

module.exports = { synthesizePiper, piperBin, modelFor, PIPER_PROFILE };
