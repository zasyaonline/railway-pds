'use strict';

const { readJson, atomicWriteJson } = require('../storage/atomic-file');
const { announceHistoryPath } = require('../../shared/paths');

function loadHistory() {
  return readJson(announceHistoryPath(), { events: [] });
}

function appendHistory(entry, retention = 200) {
  const doc = loadHistory();
  doc.events = Array.isArray(doc.events) ? doc.events : [];
  doc.events.push({
    id: entry.id || `h-${Date.now()}`,
    at: entry.at || new Date().toISOString(),
    type: entry.type,
    trainNo: entry.trainNo || null,
    languages: entry.languages || [],
    source: entry.source || 'auto',
    ok: entry.ok !== false,
    error: entry.error || null,
    wavs: entry.wavs || []
  });
  if (doc.events.length > retention) {
    doc.events = doc.events.slice(-retention);
  }
  atomicWriteJson(announceHistoryPath(), doc);
  return doc.events[doc.events.length - 1];
}

function findHistory(id) {
  return (loadHistory().events || []).find((e) => e.id === id) || null;
}

module.exports = { loadHistory, appendHistory, findHistory };
