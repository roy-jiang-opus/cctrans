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
  const target = opts.target || 'zh-CN';
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
  if (need.length === 0) return out;

  let fresh = null;
  for (const backend of fallbackChain(primary)) {
    try {
      fresh = await withTimeout(backend.translate(need, target, opts), timeoutMs);
      break;
    } catch (e) {
      fresh = null; // try next in chain
    }
  }
  if (!fresh) fresh = need.slice(); // give up -> echo source

  for (let j = 0; j < needIdx.length; j++) {
    out[needIdx[j]] = fresh[j];
    if (fresh[j] !== need[j]) cacheSet(cacheKey(need[j], target, primary), fresh[j]);
  }
  return out;
}

module.exports = { translateLines, cacheKey };
