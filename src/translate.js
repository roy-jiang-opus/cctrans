'use strict';
// Translation orchestrator: content-addressed cache + backend fallback chain.
// Backends live in src/backends/ (openai, anthropic, deepl, azure, google,
// claude-code). On primary failure/timeout the chain falls through (free
// Google last); on total failure a line echoes its source so the caller still
// shows the English.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { CACHE_DIR, ensureDirs } = require('./config');
const { fallbackChain } = require('./backends');
const { normalizeLang } = require('./langs');
const stats = require('./stats');

function cacheKey(line, target, backend) {
  return crypto.createHash('sha1').update(backend + '|' + target + '|' + line).digest('hex');
}
function cacheGet(key) {
  try { return fs.readFileSync(path.join(CACHE_DIR, key + '.txt'), 'utf8'); } catch (e) { return null; }
}
function cacheSet(key, val) {
  try {
    ensureDirs();
    const f = path.join(CACHE_DIR, key + '.txt');
    const tmp = f + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, val);
    fs.renameSync(tmp, f);
  } catch (e) {}
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

// Translate source lines -> translations, in order, using cache + the chosen
// backend with fallback. opts: {target, backend, model, timeoutMs}
async function translateLines(lines, opts) {
  opts = opts || {};
  // Normalize aliases (zh-CN -> zh-Hans, zh-TW -> zh-Hant) so cache keys are
  // canonical regardless of how the user spelled the code.
  const target = normalizeLang(opts.target || 'zh-Hans');
  const primary = opts.backend || 'google';
  const timeoutMs = opts.timeoutMs || 8000;

  const out = new Array(lines.length);
  const need = [];
  const needIdx = [];
  for (let i = 0; i < lines.length; i++) {
    const c = cacheGet(cacheKey(lines[i], target, primary));
    if (c !== null) out[i] = c;
    else { need.push(lines[i]); needIdx.push(i); }
  }
  if (need.length === 0) { recordUsage(lines, target, primary, lines.length); return out; }

  let fresh = null;
  for (const backend of fallbackChain(primary)) {
    try {
      fresh = await withTimeout(backend.translate(need, target, opts), timeoutMs);
      break;
    } catch (e) {
      fresh = null; // try next in chain
    }
  }
  const echoed = !fresh;
  if (echoed) fresh = need.slice(); // give up -> echo source

  for (let j = 0; j < needIdx.length; j++) {
    out[needIdx[j]] = fresh[j];
    if (fresh[j] !== need[j]) cacheSet(cacheKey(need[j], target, primary), fresh[j]);
  }
  if (echoed) {
    // Total backend failure: the echoes are suppressed downstream, so only the
    // cache-hit lines were actually displayed — don't credit fake savings.
    const needSet = new Set(needIdx);
    const shown = lines.filter((_, i) => !needSet.has(i));
    if (shown.length) recordUsage(shown, target, primary, shown.length);
  } else {
    recordUsage(lines, target, primary, lines.length - need.length);
  }
  return out;
}

function recordUsage(lines, target, backend, cacheHits) {
  stats.record({
    n: lines.length,
    ch: lines.reduce((s, l) => s + l.length, 0),
    hit: cacheHits,
    tg: target,
    be: backend,
  });
}

// --- Cache maintenance (called from the CLI, never from the hook — a sweep
// over a large cache directory must not eat into the 9s per-delta budget) ---

function cacheStats() {
  let files = 0, bytes = 0, oldest = Infinity;
  try {
    for (const f of fs.readdirSync(CACHE_DIR)) {
      if (!f.endsWith('.txt')) continue;
      try {
        const st = fs.statSync(path.join(CACHE_DIR, f));
        files++; bytes += st.size;
        if (st.mtimeMs < oldest) oldest = st.mtimeMs;
      } catch (e) {}
    }
  } catch (e) {}
  return { files, bytes, oldestMs: oldest === Infinity ? null : oldest };
}

// Enforce the size cap by deleting oldest-first down to 80% of the cap (so
// the GC doesn't run again immediately). Returns the number deleted.
function gcCache(maxBytes) {
  let entries = [];
  try {
    entries = fs.readdirSync(CACHE_DIR)
      .filter((f) => f.endsWith('.txt'))
      .map((f) => {
        const p = path.join(CACHE_DIR, f);
        try { const st = fs.statSync(p); return { p, size: st.size, mtime: st.mtimeMs }; } catch (e) { return null; }
      })
      .filter(Boolean);
  } catch (e) { return 0; }
  let total = entries.reduce((s, e) => s + e.size, 0);
  if (total <= maxBytes) return 0;
  entries.sort((a, b) => a.mtime - b.mtime);
  let deleted = 0;
  const floor = maxBytes * 0.8;
  for (const e of entries) {
    if (total <= floor) break;
    try { fs.unlinkSync(e.p); total -= e.size; deleted++; } catch (err) {}
  }
  return deleted;
}

module.exports = { translateLines, cacheKey, cacheStats, gcCache };
