'use strict';
// Persistent on/off state + backend selection for the translator.
// State lives in ~/.cc-translate/ (override with TT_HOME). Secrets (API keys)
// are read from the environment, never persisted here.

const fs = require('fs');
const os = require('os');
const path = require('path');

const HOME = os.homedir();
const BASE = process.env.TT_HOME || path.join(HOME, '.cc-translate');
const STATE_FILE = path.join(BASE, 'state.json');
const CACHE_DIR = path.join(BASE, 'cache');

function ensureDirs() {
  try { fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch (e) {}
}

function defaults() {
  return {
    enabled: true, // default ON: every reply shows bilingual until toggled off
    backend: process.env.TT_BACKEND || (process.env.OPENAI_API_KEY ? 'openai' : 'google'),
    target: process.env.TT_TARGET || 'zh-CN',
    model: process.env.TT_OPENAI_MODEL || 'gpt-4o-mini',
    marker: process.env.TT_MARKER || '↳ ', // prefix on each Chinese line
  };
}

function getState() {
  let s = {};
  try { s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch (e) {}
  return Object.assign(defaults(), s);
}

function setState(patch) {
  ensureDirs();
  const next = Object.assign({}, getState(), patch);
  // Persist only user-controllable, non-secret fields.
  const persist = {
    enabled: next.enabled,
    backend: next.backend,
    target: next.target,
    model: next.model,
    marker: next.marker,
  };
  const tmp = STATE_FILE + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(persist, null, 2));
  fs.renameSync(tmp, STATE_FILE);
  return next;
}

module.exports = { HOME, BASE, STATE_FILE, CACHE_DIR, ensureDirs, getState, setState, defaults };
