'use strict';

const fs = require('fs');
const path = require('path');
const { whichSync, runCommand } = require('../tts/engines/espeak');

let currentChild = null;

function wavLooksValid(filePath) {
  try {
    return Boolean(filePath && fs.existsSync(filePath) && fs.statSync(filePath).size > 44);
  } catch {
    return false;
  }
}

function playbackWavPath(filePath, volume) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath, path.extname(filePath));
  return path.join(dir, `${base}.play48.v${Number(volume) || 80}.wav`);
}

async function preparePlaybackWav(filePath, volume = 80) {
  const sox = whichSync('sox');
  if (!sox) return filePath;
  const outPath = playbackWavPath(filePath, volume);
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

function stopPlayback() {
  if (!currentChild) return false;
  try {
    currentChild.kill('SIGTERM');
  } catch {
    /* ignore */
  }
  currentChild = null;
  return true;
}

function spawnPlay(cmd, args) {
  return new Promise((resolve) => {
    const { spawn } = require('child_process');
    const child = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    currentChild = child;
    let stderr = '';
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('error', (err) => {
      if (currentChild === child) currentChild = null;
      resolve({ ok: false, error: err.message, killed: false });
    });
    child.on('close', (code, signal) => {
      if (currentChild === child) currentChild = null;
      if (signal === 'SIGTERM' || signal === 'SIGKILL') {
        resolve({ ok: false, error: 'stopped', killed: true });
        return;
      }
      if (code === 0) resolve({ ok: true, killed: false });
      else resolve({ ok: false, error: stderr.trim() || `exit ${code}`, killed: false });
    });
  });
}

async function playWav(filePath, { volume = 80, sink = 'default' } = {}) {
  if (!wavLooksValid(filePath)) {
    return { ok: false, error: 'wav missing', played: false };
  }
  if (sink === 'file' || sink === 'none') {
    return { ok: true, played: false, error: null, reason: 'file_sink' };
  }
  const playable = await preparePlaybackWav(filePath, volume);
  const aplay = whichSync('aplay');
  const paplay = whichSync('paplay');
  const afplay = whichSync('afplay');
  const device = !sink || sink === 'default' ? 'default' : sink;
  const attempts = [];
  if (aplay) {
    attempts.push({ cmd: aplay, args: ['-q', '-D', device, playable] });
    if (device !== 'default') attempts.push({ cmd: aplay, args: ['-q', '-D', 'default', playable] });
    attempts.push({ cmd: aplay, args: ['-q', '-t', 'wav', playable] });
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
    if (result.killed) return { ok: false, played: false, error: 'stopped', stopped: true };
    if (result.ok) return { ok: true, played: true, volume };
    lastError = result.error || lastError;
  }
  return { ok: false, played: false, error: lastError };
}

module.exports = { playWav, wavLooksValid, preparePlaybackWav, stopPlayback };
