'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

/** Change this when amplitude/rate/voice tuning changes so WAV cache cannot replay old distorted files. */
const ESPEAK_PROFILE = 'pa-v3';
const ESPEAK_VOICES = { en: 'en-gb', hi: 'hi', te: 'te' };

function whichSync(bin) {
  const dirs = [
    ...(process.env.PATH || '').split(path.delimiter),
    '/usr/bin',
    '/usr/sbin',
    '/bin',
    '/usr/local/bin'
  ];
  for (const dir of dirs) {
    if (!dir) continue;
    const full = path.join(dir, bin);
    try {
      if (fs.existsSync(full)) return full;
    } catch {
      /* ignore */
    }
  }
  return '';
}

function runCommand(command, args, { input, timeoutMs = 15000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    let stdout = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve({ ok: false, error: `timeout after ${timeoutMs}ms` });
    }, timeoutMs);
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ ok: false, error: err.message });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ ok: true, stdout, stderr });
      else resolve({ ok: false, error: stderr || stdout || `exit ${code}` });
    });
    if (input != null) child.stdin.end(input);
    else child.stdin.end();
  });
}

async function synthesizeEspeak({ text, language, voice, outPath, timeoutMs }) {
  const bin = whichSync('espeak-ng') || whichSync('espeak');
  if (!bin) return { ok: false, error: 'espeak-ng not installed' };
  const voiceName = voice || ESPEAK_VOICES[language] || 'en-gb';
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const result = await runCommand(
    bin,
    ['-v', voiceName, '-s', '175', '-p', '50', '-a', '70', '-g', '3', '-b', '1', '-w', outPath, text],
    { timeoutMs }
  );
  if (!result.ok) return result;
  try {
    if (!fs.existsSync(outPath) || fs.statSync(outPath).size <= 44) {
      return { ok: false, error: `espeak produced no wav for voice ${voiceName}` };
    }
  } catch (err) {
    return { ok: false, error: err.message };
  }
  return { ok: true, engine: 'espeak', voice: voiceName, outPath };
}

module.exports = { synthesizeEspeak, whichSync, runCommand, ESPEAK_PROFILE, ESPEAK_VOICES };
