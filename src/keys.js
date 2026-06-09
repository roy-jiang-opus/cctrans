'use strict';
// API-key store, isolated from the shell environment so this tool's keys and
// the terminal's keys can't contaminate each other.
//
// Keys live in ~/.cc-translate/keys.json (chmod 600), written by `tt setup`
// or `tt key`. Resolution order per key id:
//   1. keys.json
//   2. TT_*-prefixed env override (TT_OPENAI_KEY, TT_DEEPL_KEY, ...)
//   3. generic env (OPENAI_API_KEY, ...) ONLY when opted in via
//      TT_USE_ENV_KEYS=1 or `"useEnvKeys": true` in state.json
//
// NOTE: keys.js must not require config.js (config.js requires us for the
// default-backend decision), so BASE/state.json are resolved locally.

const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE = process.env.TT_HOME || path.join(os.homedir(), '.cc-translate');
const KEYS_FILE = path.join(BASE, 'keys.json');

// key id -> [TT override env, generic env]
const KEY_IDS = {
  openai: ['TT_OPENAI_KEY', 'OPENAI_API_KEY'],
  anthropic: ['TT_ANTHROPIC_KEY', 'ANTHROPIC_API_KEY'],
  deepl: ['TT_DEEPL_KEY', 'DEEPL_API_KEY'],
  azure: ['TT_AZURE_KEY', 'AZURE_TRANSLATOR_KEY'],
  'azure-region': ['TT_AZURE_REGION', 'AZURE_TRANSLATOR_REGION'],
};

function readKeys() {
  try { return JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8')); } catch (e) { return {}; }
}

function writeKeys(obj) {
  fs.mkdirSync(BASE, { recursive: true });
  const tmp = KEYS_FILE + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, KEYS_FILE);
  try { fs.chmodSync(KEYS_FILE, 0o600); } catch (e) {}
}

function useEnvKeys() {
  if (process.env.TT_USE_ENV_KEYS) return true;
  try {
    return !!JSON.parse(fs.readFileSync(path.join(BASE, 'state.json'), 'utf8')).useEnvKeys;
  } catch (e) { return false; }
}

function getKey(id) {
  const envs = KEY_IDS[id];
  if (!envs) return null;
  const stored = readKeys()[id];
  if (stored) return stored;
  if (process.env[envs[0]]) return process.env[envs[0]];
  if (useEnvKeys() && process.env[envs[1]]) return process.env[envs[1]];
  return null;
}

function setKey(id, value) {
  if (!KEY_IDS[id]) throw new Error('unknown key id: ' + id);
  const k = readKeys();
  if (value == null || value === '') delete k[id];
  else k[id] = value;
  writeKeys(k);
}

function mask(v) {
  if (!v) return '(unset)';
  return v.length <= 8 ? '****' : v.slice(0, 4) + '…' + v.slice(-4);
}

// Where a key currently resolves from: 'keys.json' | 'TT_* env' | 'env' | null
function keySource(id) {
  const envs = KEY_IDS[id];
  if (!envs) return null;
  if (readKeys()[id]) return 'keys.json';
  if (process.env[envs[0]]) return envs[0];
  if (useEnvKeys() && process.env[envs[1]]) return envs[1] + ' (useEnvKeys)';
  return null;
}

// Generic env keys that exist but aren't imported yet (for setup's import offer).
function detectEnvKeys() {
  const found = [];
  for (const [id, envs] of Object.entries(KEY_IDS)) {
    if (!readKeys()[id] && process.env[envs[1]]) found.push({ id, env: envs[1], value: process.env[envs[1]] });
  }
  return found;
}

module.exports = { KEYS_FILE, KEY_IDS, getKey, setKey, mask, keySource, detectEnvKeys, readKeys };
