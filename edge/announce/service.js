'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { readJson, atomicWriteJson } = require('../storage/atomic-file');
const {
  announceRuntimePath,
  announceMemoryPath,
  announceDataDir,
  ntesStatePath,
  freshnessPath
} = require('../../shared/paths');
const { createLogger } = require('../../shared/logging');
const { loadConfig } = require('../config/config-service');
const { loadAnnouncementConfig } = require('./config');
const { evaluateBoard, compareJobs, minutesUntil, suggestedManualType } = require('./engine');
const { renderAnnouncement } = require('./normalize');
const { appendHistory, loadHistory, findHistory } = require('./history');
const { playWav, wavLooksValid } = require('./player');
const { synthesize } = require('../tts/synthesize');
const { ensureRuntimeLayout } = require('../runtime/layout');

const log = createLogger('announce');

const runtimeDefault = {
  autoEnabled: true,
  paused: false,
  volume: 80,
  lastError: null,
  playing: false
};

function loadRuntime() {
  return { ...runtimeDefault, ...readJson(announceRuntimePath(), {}) };
}

function saveRuntime(doc) {
  atomicWriteJson(announceRuntimePath(), doc);
  return doc;
}

function loadMemory() {
  return readJson(announceMemoryPath(), { done: {}, delayAnnounced: {}, platform: {} });
}

function saveMemory(doc) {
  atomicWriteJson(announceMemoryPath(), doc);
  return doc;
}

function newId(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
}

function createAnnounceRuntime() {
  const queue = [];
  let busy = false;
  let timer = null;

  function status() {
    const rt = loadRuntime();
    return {
      autoEnabled: rt.autoEnabled,
      paused: rt.paused,
      volume: rt.volume,
      lastError: rt.lastError,
      playing: busy,
      queueLength: queue.length,
      queue: queue.slice(0, 20).map((j) => ({
        id: j.id,
        type: j.type,
        trainNo: j.trainNo,
        source: j.source
      })),
      history: (loadHistory().events || []).slice(-20).reverse()
    };
  }

  function setAuto(enabled) {
    const rt = loadRuntime();
    rt.autoEnabled = Boolean(enabled);
    saveRuntime(rt);
    return status();
  }

  function setPaused(paused) {
    const rt = loadRuntime();
    rt.paused = Boolean(paused);
    saveRuntime(rt);
    return status();
  }

  function setVolume(volume) {
    const rt = loadRuntime();
    const n = Number(volume);
    rt.volume = Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : rt.volume;
    saveRuntime(rt);
    return status();
  }

  function enqueue(job) {
    queue.push(job);
    const cfg = currentConfig();
    queue.sort((a, b) => compareJobs(a, b, cfg));
    return job;
  }

  function currentConfig() {
    const loaded = loadConfig();
    const code = loaded.config?.stationCode || 'BG';
    return loadAnnouncementConfig(code);
  }

  function currentTrains() {
    const state = readJson(ntesStatePath(), null);
    return { state, trains: state?.trains || [] };
  }

  function enqueueManual(body = {}) {
    const cfg = currentConfig();
    const { trains } = currentTrains();
    const found = trains.find((t) => String(t.trainNo) === String(body.trainNo || ''));
    const train = {
      ...(found || {}),
      trainNo: body.trainNo || found?.trainNo || '',
      trainName: body.trainName || found?.trainName || '',
      platform: body.platform || found?.platform || '',
      delay: body.delay != null && body.delay !== '' ? Number(body.delay) : Number(found?.delay || 0),
      status: body.status || found?.status || '',
      runningState: body.runningState || found?.runningState || '',
      expectedArrival: found?.expectedArrival,
      scheduledArrival: found?.scheduledArrival
    };
    const type = body.type || suggestedManualType(train) || 'manual';
    const computedMins = minutesUntil(train.expectedArrival || train.scheduledArrival);
    const minutes = body.minutes != null && body.minutes !== ''
      ? Number(body.minutes)
      : (computedMins != null && computedMins >= 0 ? computedMins : undefined);
    const job = {
      id: newId('m'),
      source: 'manual',
      type,
      trainNo: train.trainNo,
      train,
      extra: body.extra || '',
      minutes,
      languages: Array.isArray(body.languages) && body.languages.length
        ? body.languages
        : cfg.languageOrder || cfg.languages || ['en']
    };
    enqueue(job);
    processQueue().catch((err) => log.warn(err.message));
    return job;
  }

  function cancel(id) {
    const idx = queue.findIndex((j) => j.id === id);
    if (idx >= 0) {
      const [removed] = queue.splice(idx, 1);
      return { cancelled: true, job: removed };
    }
    return { cancelled: false };
  }

  function persistClip(jobId, lang, src) {
    try {
      const dir = path.join(announceDataDir(), 'clips');
      fs.mkdirSync(dir, { recursive: true });
      const dest = path.join(dir, `${jobId}-${lang}.wav`);
      fs.copyFileSync(src, dest);
      return dest;
    } catch {
      return src;
    }
  }

  async function playClips(wavs) {
    const rt = loadRuntime();
    let lastError = null;
    let playedAny = false;
    for (const wav of wavs || []) {
      if (!wavLooksValid(wav)) {
        lastError = 'wav missing';
        continue;
      }
      const played = await playWav(wav, { volume: rt.volume });
      if (played.played) playedAny = true;
      else if (played.error) lastError = played.error;
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
    if (playedAny) lastError = null;
    if (lastError) {
      const next = loadRuntime();
      next.lastError = lastError;
      saveRuntime(next);
    } else {
      const next = loadRuntime();
      next.lastError = null;
      saveRuntime(next);
    }
    return { ok: playedAny, error: lastError, wavs };
  }

  async function replay(historyId) {
    const row = findHistory(historyId);
    if (!row) return { ok: false, error: 'history item not found' };
    const existing = (row.wavs || []).filter(wavLooksValid);
    if (existing.length) {
      const played = await playClips(existing);
      return { ...played, replayed: existing.length, fromCache: true, id: historyId };
    }
    return enqueueManual({
      trainNo: row.trainNo,
      type: row.type,
      languages: row.languages,
      extra: row.extra
    });
  }

  function tickAuto() {
    const rt = loadRuntime();
    if (!rt.autoEnabled || rt.paused) return [];
    const cfg = currentConfig();
    const freshness = readJson(freshnessPath(), null);
    const stale = freshness?.sourceStatus === 'stale' || freshness?.sourceStatus === 'error';
    if (stale && cfg.staleNtes === 'stop') return [];
    if (stale && cfg.staleNtes === 'confirm') return [];
    const { trains } = currentTrains();
    const { events, memory } = evaluateBoard({
      trains,
      config: cfg,
      memory: loadMemory(),
      now: new Date(),
      stale
    });
    saveMemory(memory);
    const jobs = events.map((ev) => ({
      id: newId('a'),
      source: 'auto',
      type: ev.type,
      trainNo: ev.trainNo,
      train: ev.train,
      minutes: ev.minutes,
      languages: cfg.languageOrder || cfg.languages || ['en']
    }));
    for (const job of jobs) enqueue(job);
    return jobs;
  }

  async function speakJob(job) {
    const cfg = currentConfig();
    const langs = job.languages || ['en'];
    const wavs = [];
    let lastError = null;
    for (const lang of langs) {
      const text = renderAnnouncement({
        type: job.type,
        lang,
        config: cfg,
        train: job.train,
        extra: job.extra,
        minutes: job.minutes
      });
      if (!text) continue;
      const synth = await synthesize(text, lang, cfg.voices?.[lang] || '');
      if (!synth.ok || !wavLooksValid(synth.outPath)) {
        lastError = synth.error || 'wav missing';
        log.warn('tts failed (fail-open)', { error: lastError, lang, type: job.type });
        continue;
      }
      wavs.push(persistClip(job.id, lang, synth.outPath));
    }
    const played = await playClips(wavs);
    if (played.error) lastError = played.error;
    if (played.ok) lastError = null;
    appendHistory({
      id: job.id,
      type: job.type,
      trainNo: job.trainNo,
      languages: langs,
      source: job.source,
      ok: wavs.length > 0,
      error: lastError,
      wavs
    }, cfg.historyRetention);
    return { ok: wavs.length > 0, wavs, error: lastError };
  }

  async function processQueue() {
    if (busy) return;
    const rt = loadRuntime();
    if (rt.paused && queue[0]?.source !== 'manual') return;
    const job = queue.shift();
    if (!job) return;
    busy = true;
    try {
      await speakJob(job);
    } catch (err) {
      log.warn('announce job failed (fail-open)', { error: err.message });
      appendHistory({
        id: job.id,
        type: job.type,
        trainNo: job.trainNo,
        source: job.source,
        ok: false,
        error: err.message
      });
    } finally {
      busy = false;
    }
    if (queue.length) {
      setImmediate(() => {
        processQueue().catch((err) => log.warn(err.message));
      });
    }
  }

  function start(intervalMs = 5000) {
    ensureRuntimeLayout();
    if (timer) return;
    const loop = () => {
      try {
        tickAuto();
        processQueue().catch((err) => log.warn(err.message));
      } catch (err) {
        log.warn(err.message);
      }
    };
    loop();
    timer = setInterval(loop, intervalMs);
    if (timer.unref) timer.unref();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return {
    status,
    setAuto,
    setPaused,
    setVolume,
    enqueueManual,
    cancel,
    replay,
    tickAuto,
    processQueue,
    start,
    stop,
    _queue: queue
  };
}

let singleton = null;

function getAnnounceRuntime() {
  if (!singleton) singleton = createAnnounceRuntime();
  return singleton;
}

function resetAnnounceRuntime() {
  if (singleton) singleton.stop();
  singleton = null;
}

function startAnnounceService() {
  const rt = getAnnounceRuntime();
  rt.start();
  return rt;
}

module.exports = {
  createAnnounceRuntime,
  getAnnounceRuntime,
  resetAnnounceRuntime,
  startAnnounceService,
  loadRuntime
};
