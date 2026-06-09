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
  const { getKey } = require('./keys'); // lazy: keys.js must not require config.js
  return {
    enabled: true, // default ON: every reply shows bilingual until toggled off
    backend: process.env.TT_BACKEND || (getKey('openai') ? 'openai' : 'google'),
    target: process.env.TT_TARGET || 'zh-Hans',
    model: process.env.TT_OPENAI_MODEL || 'gpt-4o-mini',
    marker: process.env.TT_MARKER || '↳ ', // prefix on each translated line
    inputEn: false, // input translation (prompt -> English) off until enabled
    useEnvKeys: false, // generic env keys (OPENAI_API_KEY...) ignored unless opted in
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
    inputEn: next.inputEn,
    useEnvKeys: next.useEnvKeys,
  };
  const tmp = STATE_FILE + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(persist, null, 2));
  fs.renameSync(tmp, STATE_FILE);
  return next;
}

module.exports = { HOME, BASE, STATE_FILE, CACHE_DIR, ensureDirs, getState, setState, defaults };
