'use strict';
// Translation usage stats: every translateLines call appends one JSONL record
// (O_APPEND — safe under the hook's concurrent short-lived processes), and
// `cctrans stats` aggregates them into "lines translated / tokens saved".
//
// The token-saving estimate is the project's whole pitch made personal: had
// the MODEL produced the reply in the target language instead, the same
// content would have cost ratio× the tokens (per-language ratios in
// src/langs.js, sourced from MOTIVATION.md). English prose ≈ 4 chars/token,
// so displaying `ch` chars of translated English saved roughly
// ch / 4 * (ratio - 1) main-loop tokens.
//
// Recording is strictly fail-safe and fast (no fsync, swallow all errors) —
// it sits on the hook's latency budget.

const fs = require('fs');
const path = require('path');
const { BASE, ensureDirs } = require('./config');
const { getLang } = require('./langs');

const STATS_FILE = path.join(BASE, 'stats.jsonl');
const COMPACT_BYTES = 2 * 1024 * 1024; // compact when the journal grows past this

// rec: {n: lines, ch: source chars, hit: cache hits, tg: target, be: backend}
function record(rec) {
  try {
    ensureDirs();
    fs.appendFileSync(STATS_FILE, JSON.stringify(Object.assign({ t: Date.now() }, rec)) + '\n');
  } catch (e) {}
}

function readRecords() {
  let text = '';
  try { text = fs.readFileSync(STATS_FILE, 'utf8'); } catch (e) { return []; }
  const out = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch (e) {} // torn last line etc.
  }
  return out;
}

function estimateSavedTokens(chars, target) {
  const lang = getLang(target);
  const ratio = lang && lang.ratio ? lang.ratio : 1.5;
  return Math.round((chars / 4) * (ratio - 1));
}

// Aggregate records (optionally since a timestamp) into totals per target.
function aggregate(records, sinceMs) {
  const agg = { lines: 0, chars: 0, hits: 0, calls: 0, savedTokens: 0, byTarget: {} };
  for (const r of records) {
    if (sinceMs && (!r.t || r.t < sinceMs)) continue;
    const n = r.n || 0, ch = r.ch || 0, hit = r.hit || 0, tg = r.tg || '?';
    agg.lines += n; agg.chars += ch; agg.hits += hit; agg.calls++;
    agg.savedTokens += estimateSavedTokens(ch, tg);
    const t = agg.byTarget[tg] || (agg.byTarget[tg] = { lines: 0, chars: 0, savedTokens: 0 });
    t.lines += n; t.chars += ch; t.savedTokens += estimateSavedTokens(ch, tg);
  }
  return agg;
}

// Keep the journal bounded: when it outgrows COMPACT_BYTES, fold everything
// older than the current month into one summary record per (month, target).
function compactIfNeeded() {
  try {
    if (fs.statSync(STATS_FILE).size < COMPACT_BYTES) return false;
  } catch (e) { return false; }
  try {
    const records = readRecords();
    const monthStart = new Date();
    monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const cutoff = monthStart.getTime();
    const byMonth = {}; // 'YYYY-MM|target' -> summary
    const keep = [];
    for (const r of records) {
      if (r.t && r.t >= cutoff) { keep.push(r); continue; }
      const d = new Date(r.t || 0);
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '|' + (r.tg || '?');
      const s = byMonth[key] || (byMonth[key] = { t: r.t || 0, n: 0, ch: 0, hit: 0, tg: r.tg || '?', month: key.split('|')[0] });
      s.n += r.n || 0; s.ch += r.ch || 0; s.hit += r.hit || 0;
      s.t = Math.max(s.t, r.t || 0);
    }
    const lines = Object.values(byMonth).concat(keep).map((r) => JSON.stringify(r));
    const tmp = STATS_FILE + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, lines.join('\n') + (lines.length ? '\n' : ''));
    fs.renameSync(tmp, STATS_FILE);
    return true;
  } catch (e) { return false; }
}

module.exports = { STATS_FILE, record, readRecords, aggregate, estimateSavedTokens, compactIfNeeded };
