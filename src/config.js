'use strict';
// Persistent settings for the translator. Everything user-configurable lives
// in files under ~/.cc-translate/ — never in shell environment variables:
//   state.json  — settings (this module); edit by hand or via cctrans commands
//   keys.json   — API secrets (src/keys.js); chmod 600
// CCTRANS_HOME (test plumbing) and CCTRANS_DISABLE/CCTRANS_DEBUG_STDIN (hook internals) are
// the only env vars the tool reads.

const fs = require('fs');
const os = require('os');
const path = require('path');

const HOME = os.homedir();
const BASE = process.env.CCTRANS_HOME || path.join(HOME, '.cc-translate');
const STATE_FILE = path.join(BASE, 'state.json');
const CACHE_DIR = path.join(BASE, 'cache');
const MSGSTATE_DIR = path.join(BASE, 'msgstate');
const DLGMAP_DIR = path.join(BASE, 'dlgmap'); // question-dialog restore maps, keyed by tool_use_id

// Display layouts. Validate against this list everywhere (CLI, setup, hook).
const MODES = ['line', 'section', 'message'];
// How a translated line is shown: 'append' (under the English) or 'replace'
// (the translation shown in place OF the English). Replace only takes effect in
// line mode — section/message stream the English first by design, so there is
// nothing on screen to replace.
const DISPLAYS = ['append', 'replace'];

// Per-project overrides: a .cc-translate.json next to (or above) the working
// directory overrides these fields of the global state for that project.
// Secrets are NOT overridable (keys live only in keys.json) — and neither is
// azureEndpoint: a repo-controlled endpoint that receives the Azure key would
// be an exfiltration vector, so endpoint config stays global-only.
const PROJECT_FILE = '.cc-translate.json';
const PROJECT_OVERRIDABLE = ['enabled', 'backend', 'target', 'model', 'marker', 'mode', 'display', 'dialog', 'inputEn', 'inputMinChars'];

// Walk up from cwd looking for a project file (stops at the filesystem root).
function findProjectFile(cwd) {
  let dir = path.resolve(String(cwd));
  for (let i = 0; i < 64; i++) {
    const f = path.join(dir, PROJECT_FILE);
    try { if (fs.statSync(f).isFile()) return f; } catch (e) {}
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

// Remove files in dir older than maxAgeMs (0 = all). Used for per-message
// state and dialog maps left behind by sessions killed mid-message/mid-dialog.
function sweepDir(dir, maxAgeMs) {
  try {
    const cutoff = Date.now() - (maxAgeMs || 0);
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      try { if (fs.statSync(p).mtimeMs <= cutoff) fs.unlinkSync(p); } catch (e) {}
    }
  } catch (e) {}
}
function sweepMsgState(maxAgeMs) { sweepDir(MSGSTATE_DIR, maxAgeMs); }
function sweepDlgMap(maxAgeMs) { sweepDir(DLGMAP_DIR, maxAgeMs); }

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
    mode: 'line', // display layout, one of MODES: line / section / message
    display: 'append', // 'append' (ZH under EN) or 'replace' (ZH in place of EN; line mode only)
    dialog: true, // translate AskUserQuestion dialogs (PreToolUse rewrite + PostToolUse restore)
    inputEn: false, // input translation (beta, prompt -> English) off until enabled
    inputMinChars: 4, // non-Latin chars in a prompt that trigger input translation
    cacheMaxMB: 200, // translation-cache size cap, enforced by the periodic GC
  };
}

// Effective state = defaults <- global state.json <- project .cc-translate.json
// (when a cwd is given; hooks pass the cwd from their stdin payload, the CLI
// passes process.cwd() where project context matters). When a project file is
// active, its path is exposed as state.projectFile so status/doctor can say so.
function getState(cwd) {
  let s = {};
  try { s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch (e) {}
  const merged = Object.assign(defaults(), s);
  if (cwd) {
    const file = findProjectFile(cwd);
    if (file) {
      try {
        const proj = JSON.parse(fs.readFileSync(file, 'utf8'));
        for (const k of PROJECT_OVERRIDABLE) {
          if (proj[k] === undefined) continue;
          if (k === 'mode' && !MODES.includes(proj[k])) continue; // ignore invalid
          if (k === 'display' && !DISPLAYS.includes(proj[k])) continue; // ignore invalid
          merged[k] = proj[k];
        }
        merged.projectFile = file;
      } catch (e) {} // unreadable project file -> global state, fail-safe
    }
  }
  return merged;
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
    mode: next.mode,
    display: next.display,
    dialog: next.dialog,
    inputEn: next.inputEn,
    inputMinChars: next.inputMinChars,
    cacheMaxMB: next.cacheMaxMB,
  };
  const tmp = STATE_FILE + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(persist, null, 2));
  fs.renameSync(tmp, STATE_FILE);
  return next;
}

module.exports = { HOME, BASE, STATE_FILE, CACHE_DIR, MSGSTATE_DIR, DLGMAP_DIR, MODES, DISPLAYS, PROJECT_FILE, ensureDirs, getState, setState, defaults, sweepMsgState, sweepDlgMap, findProjectFile };
