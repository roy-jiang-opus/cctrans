'use strict';
// Setup entry point. Interactive mode opens the single-screen settings editor
// (src/settings.js) seeded from any flags, then verifies + prints next steps.
// Non-interactive (--yes / no TTY / flags) applies flags onto the current state
// and saves directly, no UI, never hanging. Keys go to keys.json only — the
// shell environment is never read. Flags: --lang --mode --display --backend
// --key --input --yes.

const { getState, setState, MODES, DISPLAYS } = require('./config');
const { getLang, normalizeLang } = require('./langs');
const { getBackend } = require('./backends');
const keys = require('./keys');
const { buildDisplayContent } = require('./interleave');
const { runSettings } = require('./settings');

const C = {
  dim: (s) => '\x1b[2m' + s + '\x1b[0m',
  green: (s) => '\x1b[32m' + s + '\x1b[0m',
  red: (s) => '\x1b[31m' + s + '\x1b[0m',
  bold: (s) => '\x1b[1m' + s + '\x1b[0m',
};

async function runSetup(opts) {
  opts = opts || {};
  const interactive = !opts.yes && process.stdin.isTTY;
  const st0 = getState();

  // Validate any flag-provided values up front (fail fast, both modes).
  const flagLang = opts.lang ? normalizeLang(opts.lang) : null;
  if (opts.lang && !getLang(flagLang)) { console.error(C.red('unsupported language: ' + opts.lang)); return false; }
  if (opts.mode && !MODES.includes(opts.mode)) { console.error(C.red('unknown mode: ' + opts.mode + ' (available: ' + MODES.join(', ') + ')')); return false; }
  if (opts.display && !DISPLAYS.includes(opts.display)) { console.error(C.red('unknown display: ' + opts.display + ' (available: ' + DISPLAYS.join(', ') + ')')); return false; }
  if (opts.backend && !getBackend(opts.backend)) { console.error(C.red('unknown backend: ' + opts.backend)); return false; }

  console.log(C.bold('cctrans setup') + C.dim('  (re-run anytime: cctrans settings)'));

  if (interactive) {
    // Seed the editor with any flags, then let the user adjust on one screen.
    const seed = {};
    if (flagLang) seed.target = flagLang;
    if (opts.mode) seed.mode = opts.mode;
    if (opts.display) seed.display = opts.display;
    if (opts.backend) seed.backend = opts.backend;
    if (typeof opts.input === 'string') seed.inputEn = opts.input === 'on';
    const ok = await runSettings({ seed });
    if (ok === false) return false; // cancelled — nothing saved
  } else {
    // Non-interactive: apply flags onto current state and save directly.
    const next = {
      target: flagLang || st0.target,
      mode: opts.mode || st0.mode,
      display: opts.display || st0.display,
      backend: opts.backend || st0.backend,
      inputEn: typeof opts.input === 'string' ? opts.input === 'on' : st0.inputEn,
    };
    if (opts.key) { const b = getBackend(next.backend); if (b && keys.KEY_IDS.includes(b.id)) keys.setKey(b.id, opts.key); }
    setState(next);
  }

  // Verify + next steps against the saved state.
  const st = getState();
  const b = getBackend(st.backend);
  console.log('\n' + C.green('✓') + ' saved: lang=' + st.target + ' (' + getLang(st.target).name + '), mode=' + st.mode +
    ', display=' + st.display + ', backend=' + st.backend + ', input=' + (st.inputEn ? 'on' : 'off') +
    (b && b.available() ? '' : C.red('  (no key yet — will fall back to google)')));

  process.stdout.write(C.dim('verifying… '));
  try {
    const { displayContent } = await buildDisplayContent('Setup verification: translation works.\n', {
      target: st.target, backend: st.backend, timeoutMs: 12000,
    });
    console.log('\n' + (displayContent || C.red('(nothing translated — check the backend)')));
  } catch (e) {
    console.log(C.red('verification failed: ' + e.message));
  }

  console.log(C.dim('\nNext: restart Claude Code (new session). Toggle with `!cctrans off` / `!cctrans on`. ' +
    'Adjust anytime with `cctrans settings`.'));
  return true;
}

module.exports = { runSetup };
