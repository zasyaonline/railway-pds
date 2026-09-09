'use strict';

const fs = require('fs');
const path = require('path');
const { whichSync, runCommand } = require('../tts/engines/espeak');

function wavLooksValid(filePath) {
  try {
    return Boolean(filePath && fs.existsSync(filePath) && fs.statSync(filePath).size > 44);
  } catch {
    return false;
  }
}

function playbackWavPath(filePath) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath, path.extname(filePath));
  return path.join(dir, `${base}.play48.wav`);
}

async function preparePlaybackWav(filePath, volume = 80) {
  const sox = whichSync('sox');
  if (!sox) return filePath;
  const outPath = playbackWavPath(filePath);
  try {
    const srcStat = fs.statSync(filePath);
    if (fs.existsSync(outPath) && fs.statSync(outPath).mtimeMs >= srcStat.mtimeMs && fs.statSync(outPath).size > 44) {
      return outPath;
    }
  } catch {
    /* rebuild */
  }
  const vol = Math.max(0.05, Math.min(1, Number(volume) / 100));
  const result = await runCommand(sox, [
    filePath,
    '-r', '48000',
    '-c', '2',
    '-b', '16',
    '-t', 'wav',
    outPath,
    'gain', '-n', '-3',
    'vol', String(vol)
  ], { timeoutMs: 30000 });
  if (!result.ok || !wavLooksValid(outPath)) return filePath;
  return outPath;
}

function spawnPlay(cmd, args) {
  return new Promise((resolve) => {
    const { spawn } = require('child_process');
    const child = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('error', (err) => resolve({ ok: false, error: err.message }));
    child.on('close', (code) => {
      if (code === 0) resolve({ ok: true });
      else resolve({ ok: false, error: stderr.trim() || `exit ${code}` });
    });
  });
}

async function playWav(filePath, { volume = 80 } = {}) {
  if (!wavLooksValid(filePath)) {
    return { ok: false, error: 'wav missing', played: false };
  }
  const playable = await preparePlaybackWav(filePath, volume);
  const aplay = whichSync('aplay');
  const paplay = whichSync('paplay');
  const afplay = whichSync('afplay');
  const attempts = [];
  if (aplay) {
    attempts.push({ cmd: aplay, args: ['-q', '-D', 'plughw:0,0', playable] });
    attempts.push({ cmd: aplay, args: ['-q', '-t', 'wav', playable] });
    attempts.push({ cmd: aplay, args: ['-q', '-D', 'default', playable] });
  }
  if (paplay) {
    const pulseVol = Math.max(0, Math.min(65536, Math.round((Number(volume) || 80) / 100 * 65536)));
    attempts.push({ cmd: paplay, args: ['--volume', String(pulseVol), playable] });
  }
  if (afplay) attempts.push({ cmd: afplay, args: [playable] });
  if (!attempts.length) {
    return { ok: true, played: false, error: null, reason: 'no_audio_device' };
  }
  let lastError = 'player failed';
  for (const { cmd, args } of attempts) {
    const result = await spawnPlay(cmd, args);
    if (result.ok) return { ok: true, played: true, volume };
    lastError = result.error || lastError;
  }
  return { ok: false, played: false, error: lastError };
}

module.exports = { playWav, wavLooksValid, preparePlaybackWav };
