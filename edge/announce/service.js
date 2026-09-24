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
const {
  evaluateBoard,
  compareJobs,
  minutesUntil,
  suggestedManualType,
  volumeForNow,
  confirmPlatformChange
} = require('./engine');
const { renderAnnouncement } = require('./normalize');
const { appendHistory, loadHistory, findHistory } = require('./history');
const { playWav, wavLooksValid, stopPlayback } = require('./player');
const { startRecording, stopRecording, recordingActive } = require('./recorder');
const { synthesize } = require('../tts/synthesize');
const { ensureRuntimeLayout } = require('../runtime/layout');

const log = createLogger('announce');

const runtimeDefault = {
  autoEnabled: true,
  paused: false,
  lastError: null,
  playing: false,
  engineState: 'RUNNING',
  lastPlayedAt: null,
  advisoryIndex: 0
};

function loadRuntime() {
  return { ...runtimeDefault, ...readJson(announceRuntimePath(), {}) };
}

function saveRuntime(doc) {
  atomicWriteJson(announceRuntimePath(), doc);
  return doc;
}

function loadMemory() {
  return readJson(announceMemoryPath(), {
    done: {},
    delayAnnounced: {},
    platform: {},
    schedule: {},
    arrival: {},
    pendingPlatform: {}
  });
}

function saveMemory(doc) {
  atomicWriteJson(announceMemoryPath(), doc);
  return doc;
}

function newId(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
}

function ntesStale(freshness) {
  return freshness?.sourceStatus === 'stale' || freshness?.sourceStatus === 'error';
}

function engineStateFrom({ autoEnabled, paused, stale, recording, override }) {
  if (recording || override) return 'MANUAL_OVERRIDE';
  if (stale) return 'NTES_UNAVAILABLE';
  if (!autoEnabled || paused) return 'PAUSED';
  return 'RUNNING';
}

function createAnnounceRuntime() {
  const queue = [];
  const held = [];
  let busy = false;
  let timer = null;
  let override = false;
  let liveCapture = null;

  function currentConfig() {
    const loaded = loadConfig();
    const code = loaded.config?.stationCode || 'BG';
    return loadAnnouncementConfig(code);
  }

  function currentTrains() {
    const state = readJson(ntesStatePath(), null);
    return { state, trains: state?.trains || [] };
  }

  function currentVolume(cfg = currentConfig()) {
    return volumeForNow(cfg, new Date());
  }

  function pendingList() {
    const memory = loadMemory();
    return Object.entries(memory.pendingPlatform || {}).map(([trainNo, row]) => ({
      trainNo,
      from: row.from,
      to: row.to,
      at: row.at
    }));
  }

  function status() {
    const rt = loadRuntime();
    const freshness = readJson(freshnessPath(), null);
    const stale = ntesStale(freshness);
    const state = engineStateFrom({
      autoEnabled: rt.autoEnabled,
      paused: rt.paused,
      stale,
      recording: recordingActive(),
      override
    });
    return {
      autoEnabled: rt.autoEnabled,
      paused: rt.paused,
      volume: currentVolume(),
      lastError: rt.lastError,
      playing: busy,
      recording: recordingActive(),
      engineState: state,
      ntesUnavailable: stale,
      queueLength: queue.length,
      heldLength: held.length,
      pendingPlatform: pendingList(),
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
    if (paused) {
      const keep = [];
      while (queue.length) {
        const job = queue.shift();
        if (job.source === 'manual' || job.source === 'live') keep.push(job);
        else held.push(job);
      }
      queue.push(...keep);
    } else {
      const restored = held.splice(0, held.length);
      queue.push(...restored);
    }
    saveRuntime(rt);
    return status();
  }

  function setVolume() {
    return status();
  }

  function enqueue(job, { sort = true } = {}) {
    if (job.source !== 'manual' && job.source !== 'live') {
      const rt = loadRuntime();
      if (rt.paused || override) {
        held.push(job);
        return job;
      }
    }
    if ((job.source === 'manual' || job.source === 'live') && sort) {
      queue.unshift(job);
      return job;
    }
    queue.push(job);
    if (sort) {
      const cfg = currentConfig();
      queue.sort((a, b) => compareJobs(a, b, cfg));
    }
    return job;
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
      from: body.from || found?.from || '',
      to: body.to || found?.to || '',
      delay: body.delay != null && body.delay !== '' ? Number(body.delay) : Number(found?.delay || 0),
      status: body.status || found?.status || '',
      runningState: body.runningState || found?.runningState || '',
      expectedArrival: found?.expectedArrival,
      scheduledArrival: found?.scheduledArrival,
      scheduledDeparture: found?.scheduledDeparture
    };
    let type = body.type || suggestedManualType(train, new Date(), cfg) || 'manual';
    if (type === 'departed') type = 'departing';
    if (type === 'approaching') type = 'arriving';
    const computedMins = minutesUntil(train.scheduledArrival);
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
      transcript: body.transcript || '',
      minutes,
      languages: Array.isArray(body.languages) && body.languages.length
        ? body.languages
        : cfg.languageOrder || cfg.languages || ['te', 'en', 'hi']
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
    const heldIdx = held.findIndex((j) => j.id === id);
    if (heldIdx >= 0) {
      const [removed] = held.splice(heldIdx, 1);
      return { cancelled: true, job: removed, held: true };
    }
    return { cancelled: false };
  }

  function clearAll() {
    const removed = queue.splice(0, queue.length).concat(held.splice(0, held.length));
    stopPlayback();
    return { cleared: removed.length, ...status() };
  }

  function stopNow() {
    override = true;
    const rt = loadRuntime();
    rt.paused = true;
    saveRuntime(rt);
    stopPlayback();
    if (recordingActive()) stopRecording();
    setPaused(true);
    return status();
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

  async function playClips(wavs, cfg) {
    const volume = currentVolume(cfg);
    const sink = cfg?.audio?.sink || 'default';
    let lastError = null;
    let playedAny = false;
    for (const wav of wavs || []) {
      if (!wavLooksValid(wav)) {
        lastError = 'wav missing';
        continue;
      }
      const played = await playWav(wav, { volume, sink });
      if (played.stopped) {
        lastError = 'stopped';
        break;
      }
      if (played.played) playedAny = true;
      else if (played.error) lastError = played.error;
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
    const next = loadRuntime();
    next.lastError = playedAny ? null : lastError;
    next.lastPlayedAt = new Date().toISOString();
    saveRuntime(next);
    return { ok: playedAny, error: lastError, wavs };
  }

  async function replay(historyId) {
    const row = findHistory(historyId);
    if (!row) return { ok: false, error: 'history item not found' };
    const existing = (row.wavs || []).filter(wavLooksValid);
    if (existing.length) {
      const played = await playClips(existing, currentConfig());
      appendHistory({
        id: newId('r'),
        type: row.type,
        trainNo: row.trainNo,
        languages: row.languages,
        source: 'replay',
        mode: 'replay',
        ok: played.ok,
        error: played.error,
        wavs: existing
      }, currentConfig().historyRetention);
      return { ...played, replayed: existing.length, fromCache: true, id: historyId };
    }
    return enqueueManual({
      trainNo: row.trainNo,
      type: row.type,
      languages: row.languages,
      extra: row.extra
    });
  }

  function confirmPlatform(trainNo) {
    const { trains } = currentTrains();
    const train = trains.find((t) => String(t.trainNo) === String(trainNo));
    const result = confirmPlatformChange(loadMemory(), String(trainNo), train);
    if (!result.ok) return result;
    saveMemory(result.memory);
    const cfg = currentConfig();
    enqueue({
      id: newId('a'),
      source: 'auto',
      type: 'platform_changed',
      trainNo: String(trainNo),
      train: result.event.train,
      languages: cfg.languageOrder || cfg.languages
    });
    processQueue().catch((err) => log.warn(err.message));
    return { ok: true, from: result.from, to: result.to, ...status() };
  }

  function beginLive(body = {}) {
    stopNow();
    override = true;
    const outPath = path.join(announceDataDir(), 'clips', `${newId('live')}-live.wav`);
    const cfg = currentConfig();
    const started = startRecording({
      outPath,
      device: body.device || cfg.audio?.capture || 'default'
    });
    if (!started.ok) {
      override = false;
      return started;
    }
    liveCapture = { ...started, transcript: body.transcript || '', extra: body.extra || '' };
    return { ok: true, recording: true, outPath, ...status() };
  }

  function endLive(body = {}) {
    const stopped = stopRecording();
    const capture = liveCapture;
    liveCapture = null;
    if (!stopped.ok && !capture) return { ok: false, error: stopped.error || 'not recording' };
    const wav = stopped.outPath || capture?.outPath;
    const job = {
      id: newId('l'),
      source: 'live',
      type: 'live',
      trainNo: body.trainNo || '',
      train: { trainNo: body.trainNo || '' },
      extra: body.extra || capture?.extra || '',
      transcript: body.transcript || capture?.transcript || '',
      wavs: wav ? [wav] : [],
      languages: []
    };
    enqueue(job, { sort: true });
    processQueue().catch((err) => log.warn(err.message));
    return { ok: true, job, ...status() };
  }

  function tickAuto() {
    const rt = loadRuntime();
    const cfg = currentConfig();
    const freshness = readJson(freshnessPath(), null);
    const stale = ntesStale(freshness);
    if (!rt.autoEnabled || rt.paused || override || recordingActive()) return [];
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
      languages: cfg.languageOrder || cfg.languages || ['te', 'en', 'hi']
    }));
    for (const job of jobs) enqueue(job);
    return jobs;
  }

  function tickAdvisory() {
    const rt = loadRuntime();
    const cfg = currentConfig();
    if (!rt.autoEnabled || rt.paused || override || busy || queue.length || held.length) return;
    if (recordingActive()) return;
    const clips = (cfg.advisory?.clips || []).filter((c) => c.extra || c.wav);
    if (!clips.length) return;
    const idle = Number(cfg.advisory?.idleSeconds || 0);
    if (idle <= 0) return;
    const last = rt.lastPlayedAt ? new Date(rt.lastPlayedAt).getTime() : 0;
    if (last && Date.now() - last < idle * 1000) return;
    const idx = Number(rt.advisoryIndex || 0) % clips.length;
    const clip = clips[idx];
    rt.advisoryIndex = idx + 1;
    saveRuntime(rt);
    const job = {
      id: newId('g'),
      source: 'auto',
      type: clip.type === 'greeting' ? 'greeting' : 'advisory',
      trainNo: '',
      train: {},
      extra: clip.extra || '',
      wavs: clip.wav && wavLooksValid(clip.wav) ? [clip.wav] : [],
      languages: clip.languages?.length ? clip.languages : cfg.languageOrder
    };
    enqueue(job);
  }

  async function speakJob(job) {
    const cfg = currentConfig();
    if (job.type === 'live' || (job.wavs || []).length) {
      const played = await playClips(job.wavs, cfg);
      appendHistory({
        id: job.id,
        type: job.type,
        trainNo: job.trainNo,
        languages: job.languages || [],
        source: job.source,
        mode: job.source,
        extra: job.extra,
        transcript: job.transcript,
        ok: played.ok || Boolean((job.wavs || []).length),
        error: played.error,
        wavs: job.wavs
      }, cfg.historyRetention);
      return played;
    }
    const langs = job.languages || ['te', 'en', 'hi'];
    const wavs = [];
    let lastError = null;
    for (const lang of langs) {
      const text = renderAnnouncement({
        type: job.type === 'departed' ? 'departing' : job.type,
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
        if (cfg.skipFailedLanguage === false) break;
        continue;
      }
      wavs.push(persistClip(job.id, lang, synth.outPath));
    }
    const played = await playClips(wavs, cfg);
    if (played.error) lastError = played.error;
    if (played.ok) lastError = null;
    appendHistory({
      id: job.id,
      type: job.type,
      trainNo: job.trainNo,
      languages: langs,
      source: job.source,
      mode: job.source,
      extra: job.extra,
      transcript: job.transcript,
      ok: wavs.length > 0,
      error: lastError,
      wavs
    }, cfg.historyRetention);
    return { ok: wavs.length > 0, wavs, error: lastError };
  }

  async function processQueue() {
    if (busy) return;
    const rt = loadRuntime();
    const next = queue[0];
    if (rt.paused && next && next.source !== 'manual' && next.source !== 'live') return;
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
        mode: job.source,
        ok: false,
        error: err.message
      });
    } finally {
      busy = false;
      if (job.source === 'live') override = false;
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
        tickAdvisory();
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
    stopPlayback();
    if (recordingActive()) stopRecording();
  }

  function resumeAutomatic() {
    override = false;
    return setPaused(false);
  }

  return {
    status,
    setAuto,
    setPaused,
    setVolume,
    enqueueManual,
    cancel,
    clearAll,
    stopNow,
    resumeAutomatic,
    confirmPlatform,
    beginLive,
    endLive,
    replay,
    tickAuto,
    processQueue,
    start,
    stop,
    _queue: queue,
    _held: held
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
