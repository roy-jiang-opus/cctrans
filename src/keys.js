'use strict';
// API-key store. Keys come from exactly ONE place: ~/.cc-translate/keys.json
// (chmod 600), written by `cctrans setup` / `cctrans key` or edited by hand. Shell
// environment variables are never consulted — this tool's keys and the
// terminal's keys cannot contaminate each other.
//
// NOTE: keys.js must not require config.js (config.js requires us for the
// default-backend decision). CCTRANS_HOME is internal plumbing for tests only.

const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE = process.env.CCTRANS_HOME || path.join(os.homedir(), '.cc-translate');
const KEYS_FILE = path.join(BASE, 'keys.json');

const KEY_IDS = ['openai', 'anthropic', 'deepl', 'azure', 'azure-region'];

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

function getKey(id) {
  return readKeys()[id] || null;
}

function setKey(id, value) {
  if (!KEY_IDS.includes(id)) throw new Error('unknown key id: ' + id);
  const k = readKeys();
  if (value == null || value === '') delete k[id];
  else k[id] = value;
  writeKeys(k);
}

function mask(v) {
  if (!v) return '(unset)';
  return v.length <= 8 ? '****' : v.slice(0, 4) + '…' + v.slice(-4);
}

module.exports = { KEYS_FILE, KEY_IDS, getKey, setKey, mask, readKeys };
