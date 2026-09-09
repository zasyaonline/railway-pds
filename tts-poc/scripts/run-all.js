#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { synthesize } = require('./synthesize');

const ROOT = path.join(__dirname, '..');
const corpus = JSON.parse(fs.readFileSync(path.join(ROOT, 'corpus/sentences.json'), 'utf8'));
const langs = ['en', 'hi', 'te'];

const espeakVoices = { en: 'en-gb', hi: 'hi', te: 'te' };
const piperModels = {
  en: process.env.PIPER_EN_MODEL || path.join(ROOT, 'models/en_US-lessac-medium.onnx'),
  hi: process.env.PIPER_HI_MODEL || path.join(ROOT, 'models/hi_IN-pratham-medium.onnx'),
  te: process.env.PIPER_TE_MODEL || path.join(ROOT, 'models/te_IN.onnx')
};

function appendCsv(rows) {
  const file = path.join(ROOT, 'results/measurements.csv');
  const header = 'engine,language,voice,id,ok,elapsed_ms,bytes,error\n';
  if (!fs.existsSync(file)) fs.writeFileSync(file, header);
  for (const row of rows) {
    const err = String(row.error || '').replace(/"/g, "'");
    fs.appendFileSync(
      file,
      `${row.engine},${row.language},${row.voice || ''},${row.id},${row.ok},${row.elapsedMs || ''},${row.bytes || ''},"${err}"\n`
    );
  }
}

function runEngine(engine) {
  const rows = [];
  for (const lang of langs) {
    for (const item of corpus.items) {
      const text = item[lang];
      const outPath = path.join(ROOT, 'output', engine, lang, `${item.id}.wav`);
      const voice = engine === 'espeak' ? espeakVoices[lang] : path.basename(piperModels[lang] || '');
      const result = synthesize({
        engine,
        text,
        language: lang,
        voice: engine === 'espeak' ? espeakVoices[lang] : '',
        outPath,
        piperBin: process.env.PIPER_BIN || '',
        modelPath: engine === 'piper' ? piperModels[lang] : ''
      });
      rows.push({
        engine,
        language: lang,
        voice,
        id: item.id,
        ok: result.ok,
        elapsedMs: result.elapsedMs && result.elapsedMs.toFixed(1),
        bytes: result.bytes,
        error: result.error || ''
      });
      const mark = result.ok ? 'ok' : 'FAIL';
      process.stdout.write(`${engine} ${lang} ${item.id} ${mark}${result.ok ? ` ${result.elapsedMs.toFixed(0)}ms ${result.bytes}b` : ` ${result.error}`}\n`);
    }
  }
  return rows;
}

function writeResultsMd(allRows) {
  const uname = `${os.platform()} ${os.arch()} ${os.release()}`;
  const lines = [
    '# TTS POC results',
    '',
    `Host: ${uname}`,
    `Recorded: ${new Date().toISOString()}`,
    '',
    'Quality columns are filled by a listener after playback (GOOD / ACCEPTABLE / POOR / FAIL).',
    '',
    '| Language | Engine | Voice | Generated | Notes |',
    '|---|---|---|---|---|'
  ];
  for (const engine of ['espeak', 'piper']) {
    for (const lang of langs) {
      const slice = allRows.filter((r) => r.engine === engine && r.language === lang);
      const ok = slice.filter((r) => r.ok).length;
      const voice = slice[0]?.voice || '';
      const fail = slice.filter((r) => !r.ok).map((r) => r.id);
      lines.push(
        `| ${lang} | ${engine} | ${voice} | ${ok}/${slice.length} | ${fail.length ? `missing: ${fail.join(', ')}` : 'listener TBD'} |`
      );
    }
  }
  const piperTe = allRows.filter((r) => r.engine === 'piper' && r.language === 'te' && r.ok);
  const piperOk = allRows.filter((r) => r.engine === 'piper' && r.ok).length;
  const espeakOk = allRows.filter((r) => r.engine === 'espeak' && r.ok).length;
  lines.push('', '## Decision gate (draft from generation, not pronunciation)', '');
  if (piperOk >= 20 && piperTe.length >= 8) {
    lines.push('- Draft: **A — Piper selected** pending listener scores.');
  } else if (piperOk > 0 && espeakOk >= 20) {
    lines.push('- Draft: **hybrid** — Piper where models exist, eSpeak NG for missing languages (often Telugu). Confirm with listener scores.');
  } else if (espeakOk >= 20) {
    lines.push('- Draft: **B — eSpeak NG selected** as the engine that produced all three languages. Confirm with listener scores.');
  } else {
    lines.push('- Draft: **C — Neither selected** until Ubuntu ARM64 install and playback succeed.');
  }
  lines.push('', 'Do not freeze production from this file until Hindi/Telugu railway pronunciation is scored.');
  fs.writeFileSync(path.join(ROOT, 'results/results.md'), `${lines.join('\n')}\n`);
}

const engines = (process.argv[2] || 'espeak,piper').split(',').map((s) => s.trim()).filter(Boolean);
const all = [];
for (const engine of engines) {
  all.push(...runEngine(engine));
}
appendCsv(all);
writeResultsMd(all);
process.stdout.write(`Wrote ${path.join(ROOT, 'results/measurements.csv')}\n`);
process.stdout.write(`Wrote ${path.join(ROOT, 'results/results.md')}\n`);
