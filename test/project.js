'use strict';
// Per-project overrides: a .cc-translate.json next to (or above) the cwd
// overrides whitelisted fields of the global state. Verifies the walk-up
// search, precedence, invalid-value rejection, fail-safe parsing, and that
// setState never absorbs project values into the global file.
const fs = require('fs');
const os = require('os');
const path = require('path');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cctrans-project-'));
process.env.CCTRANS_HOME = path.join(TMP, 'home');

const assert = require('assert');
const { getState, setState, PROJECT_FILE } = require('../src/config');

// Global state: zh-Hans / line.
fs.mkdirSync(process.env.CCTRANS_HOME, { recursive: true });
setState({ target: 'zh-Hans', mode: 'line', enabled: true });

// A project tree with an override at the root and a nested working dir.
const repo = path.join(TMP, 'repo');
const nested = path.join(repo, 'src', 'deep');
fs.mkdirSync(nested, { recursive: true });
fs.writeFileSync(path.join(repo, PROJECT_FILE), JSON.stringify({ target: 'ja', mode: 'section', enabled: false }));

// No cwd -> global state, no project field.
let st = getState();
assert.strictEqual(st.target, 'zh-Hans');
assert.strictEqual(st.projectFile, undefined);

// cwd at the repo root and nested deep inside both find the override.
for (const cwd of [repo, nested]) {
  st = getState(cwd);
  assert.strictEqual(st.target, 'ja', 'target overridden from ' + cwd);
  assert.strictEqual(st.mode, 'section', 'mode overridden');
  assert.strictEqual(st.enabled, false, 'enabled overridable (the per-repo kill switch)');
  assert.strictEqual(st.projectFile, path.join(repo, PROJECT_FILE), 'projectFile exposed');
}

// A cwd outside the repo is untouched by the override.
st = getState(TMP);
assert.strictEqual(st.target, 'zh-Hans');

// Invalid mode in the project file is ignored; other overrides still apply.
fs.writeFileSync(path.join(repo, PROJECT_FILE), JSON.stringify({ mode: 'bogus', target: 'ko' }));
st = getState(nested);
assert.strictEqual(st.mode, 'line', 'invalid project mode ignored');
assert.strictEqual(st.target, 'ko', 'valid override still applies');

// Unparseable project file -> global state (fail-safe).
fs.writeFileSync(path.join(repo, PROJECT_FILE), '{not json');
st = getState(nested);
assert.strictEqual(st.target, 'zh-Hans', 'broken project file falls back to global');
assert.strictEqual(st.projectFile, undefined);

// setState writes GLOBAL state only — project values must never leak in,
// even when a project file is active in the process cwd.
fs.writeFileSync(path.join(repo, PROJECT_FILE), JSON.stringify({ target: 'ja' }));
setState({ backend: 'google' });
const persisted = JSON.parse(fs.readFileSync(path.join(process.env.CCTRANS_HOME, 'state.json'), 'utf8'));
assert.strictEqual(persisted.target, 'zh-Hans', 'project target must not leak into global state.json');

console.log('PASS: project overrides — walk-up search, precedence, invalid/broken files fail safe, global writes stay clean.');
