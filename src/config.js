'use strict';
// Persistent settings for the translator. Everything user-configurable lives
// in files under ~/.cc-translate/ — never in shell environment variables:
//   state.json  — settings (this module); edit by hand or via tt commands
//   keys.json   — API secrets (src/keys.js); chmod 600
// TT_HOME (test plumbing) and TT_DISABLE/TT_DEBUG_STDIN (hook internals) are
// the only env vars the tool reads.

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
    backend: getKey('openai') ? 'openai' : 'google',
    target: 'zh-Hans',
    model: 'gpt-4o-mini', // openai backend model
    anthropicModel: 'claude-haiku-4-5', // anthropic backend model
    azureEndpoint: 'https://api.cognitive.microsofttranslator.com',
    marker: '↳ ', // prefix on each translated line
    inputEn: false, // input translation (prompt -> English) off until enabled
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
    anthropicModel: next.anthropicModel,
    azureEndpoint: next.azureEndpoint,
    marker: next.marker,
    inputEn: next.inputEn,
  };
  const tmp = STATE_FILE + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(persist, null, 2));
  fs.renameSync(tmp, STATE_FILE);
  return next;
}

module.exports = { HOME, BASE, STATE_FILE, CACHE_DIR, ensureDirs, getState, setState, defaults };
