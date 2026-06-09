'use strict';
// Translation backends + a content-addressed cache.
// Backends:
//   - openai: gpt-4o-mini batch call, high quality, preserves code/paths/markdown
//   - google: free unofficial endpoint, no key, fast, lower quality
// Every translated line is cached by sha1(backend|target|line) so repaints and
// repeated lines (very common in tool-heavy chats) cost nothing.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { CACHE_DIR, ensureDirs } = require('./config');

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

async function googleLine(line, target) {
  const url =
    'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=' +
    encodeURIComponent(target) + '&dt=t&q=' + encodeURIComponent(line);
  const res = await fetch(url);
  if (!res.ok) throw new Error('google ' + res.status);
  const j = await res.json();
  return (j[0] || []).map((seg) => seg[0]).join('');
}

async function openaiBatch(lines, target, model) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('no OPENAI_API_KEY');
  const sys =
    'You translate developer-tool chat from English to ' + target + '. ' +
    'Translate each input line to natural, concise ' + target + '. ' +
    'Keep inline code, file paths, URLs, identifiers, numbers, and leading markdown ' +
    'markers (#, -, *, >, digits., backticks) intact. ' +
    'Return ONLY JSON {"t":[...]} whose array has EXACTLY the same length and order ' +
    'as the input lines. Never merge, split, add, or drop lines.';
  const body = {
    model: model || 'gpt-4o-mini',
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: JSON.stringify({ lines }) },
    ],
  };
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('openai ' + res.status + ' ' + (await res.text()).slice(0, 200));
  const j = await res.json();
  const parsed = JSON.parse(j.choices[0].message.content);
  const t = parsed.t || parsed.translations || parsed.lines;
  if (!Array.isArray(t) || t.length !== lines.length) {
    throw new Error('length mismatch ' + (t && t.length) + '/' + lines.length);
  }
  return t;
}

// Translate source lines -> translations, in order, using cache + chosen backend.
// Falls back to google per-line if the openai batch fails. On total failure a
// line falls back to its own source text (caller still shows the English).
async function translateLines(lines, opts) {
  opts = opts || {};
  const target = opts.target || 'zh-CN';
  const backend = opts.backend || 'google';
  const model = opts.model;
  const timeoutMs = opts.timeoutMs || 8000;

  const out = new Array(lines.length);
  const need = [];
  const needIdx = [];
  for (let i = 0; i < lines.length; i++) {
    const c = cacheGet(cacheKey(lines[i], target, backend));
    if (c !== null) out[i] = c;
    else { need.push(lines[i]); needIdx.push(i); }
  }
  if (need.length === 0) return out;

  let fresh;
  try {
    if (backend === 'openai') {
      try {
        fresh = await withTimeout(openaiBatch(need, target, model), timeoutMs);
      } catch (e) {
        fresh = await withTimeout(Promise.all(need.map((l) => googleLine(l, target).catch(() => l))), timeoutMs);
      }
    } else {
      fresh = await withTimeout(Promise.all(need.map((l) => googleLine(l, target).catch(() => l))), timeoutMs);
    }
  } catch (e) {
    fresh = need.slice(); // give up -> echo source; caller still shows English
  }

  for (let j = 0; j < needIdx.length; j++) {
    out[needIdx[j]] = fresh[j];
    if (fresh[j] !== need[j]) cacheSet(cacheKey(need[j], target, backend), fresh[j]);
  }
  return out;
}

module.exports = { translateLines, googleLine, openaiBatch, cacheKey };
