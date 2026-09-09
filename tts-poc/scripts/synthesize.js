#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function arg(name, fallback) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  return process.argv[idx + 1];
}

function which(bin) {
  const r = spawnSync('bash', ['-lc', `command -v ${bin}`], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : '';
}

function synthesize({ engine, text, language, voice, outPath, piperBin, modelPath }) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const started = process.hrtime.bigint();
  if (engine === 'espeak') {
    const bin = which('espeak-ng') || which('espeak');
    if (!bin) {
      return { ok: false, error: 'espeak-ng not installed' };
    }
    const voiceName = voice || ({ en: 'en-gb', hi: 'hi', te: 'te' }[language] || language);
    const result = spawnSync(
      bin,
      ['-v', voiceName, '-s', '140', '-w', outPath, text],
      { encoding: 'utf8' }
    );
    if (result.status !== 0) {
      return { ok: false, error: result.stderr || result.stdout || `espeak exit ${result.status}` };
    }
  } else if (engine === 'piper') {
    const bin = piperBin || which('piper') || process.env.PIPER_BIN;
    if (!bin || !fs.existsSync(bin)) {
      return { ok: false, error: 'piper binary not found' };
    }
    if (!modelPath || !fs.existsSync(modelPath)) {
      return { ok: false, error: `piper model missing: ${modelPath || '(none)'}` };
    }
    const result = spawnSync(bin, ['--model', modelPath, '--output_file', outPath], {
      input: text,
      encoding: 'utf8'
    });
    if (result.status !== 0) {
      return { ok: false, error: result.stderr || result.stdout || `piper exit ${result.status}` };
    }
  } else {
    return { ok: false, error: `unknown engine ${engine}` };
  }
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  let bytes = 0;
  try {
    bytes = fs.statSync(outPath).size;
  } catch {
    return { ok: false, error: 'wav not written' };
  }
  return { ok: true, outPath, elapsedMs, bytes, engine, language, voice: voice || null };
}

if (require.main === module) {
  const engine = arg('engine', 'espeak');
  const language = arg('language', 'en');
  const text = arg('text', '');
  const voice = arg('voice', '');
  const outPath = arg('out', path.join(process.cwd(), 'out.wav'));
  const piperBin = arg('piper-bin', process.env.PIPER_BIN || '');
  const modelPath = arg('model', '');
  if (!text) {
    process.stderr.write('Usage: synthesize.js --engine espeak|piper --language en --text "..." --out file.wav\n');
    process.exit(1);
  }
  const result = synthesize({ engine, text, language, voice, outPath, piperBin, modelPath });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exit(result.ok ? 0 : 2);
}

module.exports = { synthesize };
