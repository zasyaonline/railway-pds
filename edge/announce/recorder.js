'use strict';

const fs = require('fs');
const path = require('path');
const { whichSync } = require('../tts/engines/espeak');

let current = null;

function recordingActive() {
  return Boolean(current?.child);
}

function startRecording({ outPath, device = 'default' } = {}) {
  if (current?.child) {
    return { ok: false, error: 'already recording' };
  }
  const arecord = whichSync('arecord');
  if (!arecord) {
    return { ok: false, error: 'arecord not installed' };
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const { spawn } = require('child_process');
  const args = ['-f', 'cd', '-t', 'wav', '-q', '-D', device || 'default', outPath];
  const child = spawn(arecord, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  current = { child, outPath, startedAt: new Date().toISOString() };
  child.on('error', () => {
    if (current?.child === child) current = null;
  });
  child.on('close', () => {
    if (current?.child === child) current = null;
  });
  return { ok: true, outPath, startedAt: current.startedAt };
}

function stopRecording() {
  if (!current?.child) {
    return { ok: false, error: 'not recording' };
  }
  const { child, outPath, startedAt } = current;
  try {
    child.kill('SIGINT');
  } catch {
    try {
      child.kill('SIGTERM');
    } catch {
      /* ignore */
    }
  }
  current = null;
  return { ok: true, outPath, startedAt, stoppedAt: new Date().toISOString() };
}

module.exports = { startRecording, stopRecording, recordingActive };
