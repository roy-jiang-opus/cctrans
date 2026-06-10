#!/usr/bin/env node
'use strict';
// cctrans — control + test CLI for the Claude Code bilingual overlay.
//
//   cctrans on | off | toggle | status
//   cctrans backend <openai|google>
//   cctrans install | uninstall        register/remove the MessageDisplay hook
//   cctrans last [N]                    translate the latest (or Nth-back) reply -> stdout
//   cctrans test <text...>              translate ad-hoc text -> stdout
//   cctrans help

const fs = require('fs');
const os = require('os');
const path = require('path');

const { getState, setState, STATE_FILE, BASE, CACHE_DIR, MODES, DISPLAYS, PROJECT_FILE, sweepMsgState } = require('../src/config');
const { buildDisplayContent, planSections, renderSections } = require('../src/interleave');
const { findTranscript, extractReply } = require('../src/transcript');
const { listBackends, getBackend } = require('../src/backends');
const { getLang, listLangs, normalizeLang } = require('../src/langs');
const { cacheStats, gcCache } = require('../src/translate');
const usageStats = require('../src/stats');

const VERSION = require('../package.json').version;
const MIN_CC = [2, 1, 152]; // first Claude Code release with the MessageDisplay hook
const MODE_DESC = {
  line: 'translation under each English line',
  section: 'English streams as-is; each block\'s translation appears when the block completes',
  message: 'English streams as-is; one grouped translation at the end of the reply',
};
const DISPLAY_DESC = {
  append: 'show the translation under the English',
  replace: 'show only the translation, in place of the English (line mode only)',
};
const HOOK_PATH = path.resolve(__dirname, '..', 'hook', 'message-display.js');
const INPUT_HOOK_PATH = path.resolve(__dirname, '..', 'hook', 'user-prompt-submit.js');
const SETTINGS = path.join(os.homedir(), '.claude', 'settings.json');
const keys = require('../src/keys');

const C = {
  dim: (s) => '\x1b[2m' + s + '\x1b[0m',
  cyan: (s) => '\x1b[36m' + s + '\x1b[0m',
  green: (s) => '\x1b[32m' + s + '\x1b[0m',
  red: (s) => '\x1b[31m' + s + '\x1b[0m',
  bold: (s) => '\x1b[1m' + s + '\x1b[0m',
};

function claudeVersion() {
  try {
    const out = require('child_process').execSync('claude --version', {
      encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'ignore'],
    });
    const m = out.match(/(\d+)\.(\d+)\.(\d+)/);
    return { raw: out.trim(), parts: m ? [+m[1], +m[2], +m[3]] : null };
  } catch (e) { return null; }
}
function ccAtLeast(parts, min) {
  for (let i = 0; i < 3; i++) {
    if (parts[i] > min[i]) return true;
    if (parts[i] < min[i]) return false;
  }
  return true;
}

// A project .cc-translate.json can override what the global setters write —
// without this note, `cctrans on` (etc.) inside such a repo prints a success
// that the current project silently ignores.
function noteProjectOverride(field, globalValue) {
  try {
    const eff = getState(process.cwd());
    if (eff.projectFile && eff[field] !== globalValue) {
      console.log(C.dim('  note: ' + eff.projectFile + ' sets ' + field + '=' + JSON.stringify(eff[field]) + ' — this project keeps that override'));
    }
  } catch (e) {}
}

// Enforce the cache size cap at most once a day, from CLI commands only — a
// directory sweep must never sit on the hook's per-delta latency budget.
function maybeGcCache() {
  const stamp = path.join(CACHE_DIR, '.gc-stamp');
  try { if (Date.now() - fs.statSync(stamp).mtimeMs < 24 * 3600 * 1000) return; } catch (e) {}
  try { fs.mkdirSync(CACHE_DIR, { recursive: true }); fs.writeFileSync(stamp, ''); } catch (e) {}
  gcCache((getState().cacheMaxMB || 200) * 1024 * 1024);
}

function readSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS, 'utf8')); } catch (e) { return {}; }
}
function writeSettings(s) {
  try { fs.copyFileSync(SETTINGS, SETTINGS + '.bak-cctrans'); } catch (e) {}
  const tmp = SETTINGS + '.cctrans.tmp';
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2));
  fs.renameSync(tmp, SETTINGS);
}
function hookInstalled(s) {
  s = s || readSettings();
  const groups = (s.hooks && s.hooks.MessageDisplay) || [];
  return JSON.stringify(groups).includes('message-display.js');
}
function inputHookInstalled(s) {
  s = s || readSettings();
  const groups = (s.hooks && s.hooks.UserPromptSubmit) || [];
  return JSON.stringify(groups).includes('user-prompt-submit.js');
}

function install() {
  const s = readSettings();
  s.hooks = s.hooks || {};
  let changed = false;
  if (!hookInstalled(s)) {
    s.hooks.MessageDisplay = s.hooks.MessageDisplay || [];
    s.hooks.MessageDisplay.push({ hooks: [{ type: 'command', command: 'node ' + HOOK_PATH }] });
    changed = true;
  }
  if (!inputHookInstalled(s)) {
    // Registered always; the hook exits instantly unless `cctrans input on`.
    s.hooks.UserPromptSubmit = s.hooks.UserPromptSubmit || [];
    s.hooks.UserPromptSubmit.push({ hooks: [{ type: 'command', command: 'node ' + INPUT_HOOK_PATH }] });
    changed = true;
  }
  if (changed) {
    writeSettings(s);
    console.log(C.green('✓') + ' registered MessageDisplay + UserPromptSubmit hooks in ' + SETTINGS);
  } else {
    console.log(C.green('✓') + ' hooks already registered in ' + SETTINGS);
  }
  // Make `cctrans` runnable from anywhere (best-effort symlink on a common PATH dir).
  const linkDir = path.join(os.homedir(), '.local', 'bin');
  const link = path.join(linkDir, 'cctrans');
  try {
    fs.mkdirSync(linkDir, { recursive: true });
    try { fs.unlinkSync(link); } catch (e) {}
    fs.symlinkSync(path.resolve(__dirname, 'cctrans.js'), link);
    fs.chmodSync(path.resolve(__dirname, 'cctrans.js'), 0o755);
    console.log(C.green('✓') + ' linked `cctrans` -> ' + link + (process.env.PATH.includes(linkDir) ? '' : C.dim('  (add ' + linkDir + ' to PATH)')));
  } catch (e) {
    console.log(C.dim('  (could not symlink cctrans; add alias:  alias cctrans=\'node ' + path.resolve(__dirname, 'cctrans.js') + '\')'));
  }
  const ccv = claudeVersion();
  if (!ccv) {
    console.log(C.red('!') + ' Claude Code CLI not found on PATH — the hooks only run inside Claude Code.');
  } else if (ccv.parts && !ccAtLeast(ccv.parts, MIN_CC)) {
    console.log(C.red('!') + ' Claude Code ' + ccv.raw + ' is too old: the MessageDisplay hook needs >= ' + MIN_CC.join('.') + '. Update Claude Code first.');
  }
  console.log('');
  console.log('Next:');
  console.log('  1. Restart Claude Code (new session) so the hook loads.');
  console.log('  2. Send any message — replies now show ' + C.bold('English + 中文') + ' inline.');
  console.log('  3. Toggle anytime:  ' + C.bold('!cctrans off') + ' / ' + C.bold('!cctrans on') + '  (typed inside Claude Code).');
}

function uninstall() {
  const s = readSettings();
  if (s.hooks) {
    for (const [event, file] of [['MessageDisplay', 'message-display.js'], ['UserPromptSubmit', 'user-prompt-submit.js']]) {
      if (Array.isArray(s.hooks[event])) {
        s.hooks[event] = s.hooks[event].filter((g) => !JSON.stringify(g).includes(file));
        if (s.hooks[event].length === 0) delete s.hooks[event];
      }
    }
    if (Object.keys(s.hooks).length === 0) delete s.hooks;
    writeSettings(s);
  }
  console.log(C.green('✓') + ' removed cctrans hooks. Restart Claude Code to take effect.');
}

function status() {
  const st = getState(process.cwd());
  const installed = hookInstalled();
  const b = getBackend(st.backend);
  const lang = getLang(st.target);
  const ccv = claudeVersion();
  console.log(C.bold('cctrans status') + C.dim('  v' + VERSION + ' · node ' + process.version));
  console.log('  enabled : ' + (st.enabled ? C.green('ON') : C.red('OFF')));
  console.log('  hook    : ' + (installed ? C.green('installed') : C.red('not installed') + C.dim('  (run: cctrans install)')));
  console.log('  claude  : ' + (ccv
    ? ccv.raw + (ccv.parts && !ccAtLeast(ccv.parts, MIN_CC) ? C.red('  (MessageDisplay needs >= ' + MIN_CC.join('.') + ')') : '')
    : C.red('not found on PATH')));
  if (st.projectFile) console.log('  project : ' + st.projectFile + C.dim('  (overrides global settings here)'));
  console.log('  backend : ' + st.backend + (b ? (b.available() ? C.green('  (ready)') : C.red('  (missing: ' + b.needs + ')')) : C.red('  (unknown backend)')));
  console.log('  lang    : ' + st.target + (lang ? C.dim('  (' + lang.name + ')') : C.red('  (unsupported — see: cctrans lang)')));
  console.log('  mode    : ' + st.mode + C.dim('  (' + (MODE_DESC[st.mode] || 'unknown mode') + ')'));
  console.log('  display : ' + st.display + C.dim('  (' + (DISPLAY_DESC[st.display] || 'unknown') +
    (st.display === 'replace' && st.mode !== 'line' ? C.red('; no effect in ' + st.mode + ' mode') : '') + ')'));
  console.log('  input   : ' + (st.inputEn ? C.green('ON') : 'off') + C.dim('  (beta; prompt -> English; toggle: cctrans input on|off; triggers at ' + st.inputMinChars + '+ non-Latin chars)'));
  console.log('  keys    : ' + Object.keys(keys.readKeys()).length + ' in ' + keys.KEYS_FILE + C.dim('  (manage: cctrans key)'));
  console.log('  state   : ' + STATE_FILE);
}

function keyCmd(rest) {
  const [id, value] = rest;
  if (!id) {
    console.log(C.bold('keys') + C.dim('  (' + keys.KEYS_FILE + ', chmod 600 — the only key source; env vars are never read)'));
    for (const kid of keys.KEY_IDS) {
      const v = keys.getKey(kid);
      console.log('  ' + kid.padEnd(14) + (v ? C.green(keys.mask(v)) : C.dim('(unset)')));
    }
    return;
  }
  if (!keys.KEY_IDS.includes(id)) { console.error('unknown key id: ' + id + '\nvalid: ' + keys.KEY_IDS.join(', ')); process.exit(1); }
  if (!value) { console.log(id + ' = ' + keys.mask(keys.getKey(id))); return; }
  if (value === '--clear') { keys.setKey(id, null); console.log(C.green('✓') + ' cleared ' + id); return; }
  keys.setKey(id, value);
  console.log(C.green('✓') + ' ' + id + ' = ' + keys.mask(value) + C.dim('  saved to ' + keys.KEYS_FILE));
}

function backends() {
  const st = getState();
  console.log(C.bold('backends') + C.dim('  (switch: cctrans backend <id>)'));
  for (const b of listBackends()) {
    const mark = b.id === st.backend ? C.cyan('▶ ') : '  ';
    const ok = b.available() ? C.green('ready    ') : C.red('missing  ');
    console.log(mark + b.id.padEnd(12) + ok + C.dim('needs: ' + b.needs));
  }
}

// `cctrans doctor` — the antidote to the fail-safe design: every hook failure
// degrades silently to plain English, so this is where a user finds out WHY
// nothing is being translated. Progressive ✓/!/✗ checks; exits 1 on hard fails.
async function doctor() {
  const st = getState(process.cwd());
  let hardFail = false;
  const ok = (label, detail) => console.log('  ' + C.green('✓') + ' ' + label + (detail ? C.dim('  ' + detail) : ''));
  const warn = (label, detail) => console.log('  ' + C.cyan('!') + ' ' + label + (detail ? C.dim('  ' + detail) : ''));
  const bad = (label, detail, soft) => {
    console.log('  ' + C.red('✗') + ' ' + label + (detail ? C.dim('  ' + detail) : ''));
    if (!soft) hardFail = true;
  };

  console.log(C.bold('cctrans doctor') + C.dim('  v' + VERSION + ' · node ' + process.version));

  if (process.env.CCTRANS_DISABLE) bad('CCTRANS_DISABLE is set in this shell', 'the hooks exit immediately — unset it');

  const ccv = claudeVersion();
  if (!ccv) bad('Claude Code CLI not found on PATH', 'install Claude Code, or check PATH in the shell that launches it');
  else if (ccv.parts && !ccAtLeast(ccv.parts, MIN_CC)) bad('Claude Code ' + ccv.raw, 'MessageDisplay needs >= ' + MIN_CC.join('.') + ' — update Claude Code');
  else ok('Claude Code ' + ccv.raw);

  const settings = readSettings();
  for (const [event, file, currentPath, required] of [
    ['MessageDisplay', 'message-display.js', HOOK_PATH, true],
    ['UserPromptSubmit', 'user-prompt-submit.js', INPUT_HOOK_PATH, false],
  ]) {
    // Walk the real hook group objects (never regex the JSON blob: quoted
    // paths with spaces would falsely read as "not registered").
    const commands = [];
    for (const g of (settings.hooks && settings.hooks[event]) || []) {
      for (const h of (g && g.hooks) || []) {
        if (h && typeof h.command === 'string' && h.command.includes(file)) commands.push(h.command);
      }
    }
    if (!commands.length) {
      if (required) bad(event + ' hook not registered', 'run: cctrans install');
      else warn(event + ' hook not registered', 'input translation needs it — run: cctrans install');
      continue;
    }
    // Best-effort path extraction: quoted first, then a bare token. If the
    // path can't be extracted confidently (e.g. unquoted spaces), registration
    // itself still counts — only verify what we could parse.
    const fileRe = file.replace('.', '\\.');
    const m = commands[0].match(new RegExp('"([^"]*' + fileRe + ')"')) || commands[0].match(new RegExp('(\\S*' + fileRe + ')'));
    const hookPath = m && m[1];
    if (hookPath && path.isAbsolute(hookPath) && !fs.existsSync(hookPath)) {
      bad(event + ' hook points at a missing file', hookPath + ' — run: cctrans install');
    } else if (hookPath && path.isAbsolute(hookPath) && path.resolve(hookPath) !== currentPath) {
      warn(event + ' hook registered from a different install', hookPath + ' (this CLI: ' + currentPath + ')');
    } else {
      ok(event + ' hook registered');
    }
  }

  if (!st.enabled) warn('translation is OFF', 'cctrans on');
  else ok('translation is ON');
  const lang = getLang(st.target);
  if (lang) ok('target ' + st.target + ' (' + lang.name + '), mode ' + st.mode);
  else bad('unsupported target language: ' + st.target, 'available: ' + listLangs().join(', '));
  if (st.projectFile) warn('project override active', st.projectFile);

  const b = getBackend(st.backend);
  if (!b) bad('unknown backend: ' + st.backend, 'cctrans backends');
  else if (!b.available()) warn('backend ' + st.backend + ' missing: ' + b.needs, 'will fall back to google');

  const probeTarget = st.target === 'en' || !lang ? 'zh-Hans' : st.target;
  const probe = async (backend) => {
    const sentence = 'Translation health check at ' + new Date().toISOString() + '.';
    const t0 = Date.now();
    let timer;
    try {
      const result = await Promise.race([
        backend.translate([sentence], probeTarget, { model: st.model, anthropicModel: st.anthropicModel, azureEndpoint: st.azureEndpoint }),
        new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('timeout after 10s')), 10000); }),
      ]);
      const text = result && result[0];
      if (!text || !text.trim()) throw new Error('empty result');
      if (text.trim() === sentence) throw new Error('returned the input unchanged');
      return Date.now() - t0;
    } finally {
      clearTimeout(timer); // a live timer would keep doctor's process alive for the full 10s
    }
  };
  let googleOk = false;
  try {
    const ms = await probe(getBackend('google'));
    googleOk = true;
    ok('google fallback reachable', ms + 'ms');
  } catch (e) {
    bad('google fallback failed', String(e.message || e), true);
  }
  if (b && b.id !== 'google') {
    if (b.available()) {
      try { ok('backend ' + b.id + ' translated', (await probe(b)) + 'ms'); }
      catch (e) { bad('backend ' + b.id + ' failed: ' + String(e.message || e), googleOk ? 'google fallback covers it' : 'and google is down too', googleOk); }
    }
  }
  if (!googleOk && (!b || b.id === 'google' || !b.available())) hardFail = true;

  try {
    const probeFile = path.join(BASE, '.doctor-probe');
    fs.mkdirSync(BASE, { recursive: true });
    fs.writeFileSync(probeFile, 'ok'); fs.unlinkSync(probeFile);
    ok('state dir writable', BASE);
  } catch (e) { bad('state dir not writable: ' + BASE, String(e.message || e)); }

  try {
    const le = JSON.parse(fs.readFileSync(path.join(BASE, 'last-error.json'), 'utf8'));
    const ageH = Math.round((Date.now() - Date.parse(le.ts)) / 3600000);
    warn('last hook error (' + (ageH < 1 ? '<1h' : ageH < 48 ? ageH + 'h' : Math.round(ageH / 24) + 'd') + ' ago, ' + le.hook + '/' + le.stage + ')',
      String(le.error || '').split('\n')[0].slice(0, 120));
  } catch (e) { ok('no recorded hook errors'); }

  console.log(hardFail
    ? C.red('✗ problems found') + C.dim(' — fix the ✗ items above; ! items are informational')
    : C.green('✓ everything looks good') + C.dim(' — if translation still doesn\'t appear, restart the Claude Code session'));
  if (hardFail) process.exit(1);
}

function statsCmd() {
  const recs = usageStats.readRecords();
  if (!recs.length) {
    console.log('no usage recorded yet — stats accumulate as replies are translated');
    return;
  }
  usageStats.compactIfNeeded();
  const fmt = (n) => n.toLocaleString('en-US');
  const all = usageStats.aggregate(recs);
  const recent = usageStats.aggregate(recs, Date.now() - 30 * 24 * 3600 * 1000);
  console.log(C.bold('cctrans stats'));
  console.log('  last 30 days : ' + fmt(recent.lines) + ' lines translated (' + fmt(recent.chars) + ' chars), ' +
    (recent.lines ? Math.round((recent.hits / recent.lines) * 100) : 0) + '% from cache');
  console.log('  all time     : ' + fmt(all.lines) + ' lines (' + fmt(all.chars) + ' chars)');
  console.log('  ' + C.bold('est. main-loop tokens saved: ~' + fmt(all.savedTokens)) +
    C.dim('  (~' + fmt(recent.savedTokens) + ' in the last 30 days)'));
  const targets = Object.keys(all.byTarget);
  if (targets.length > 1) {
    for (const tg of targets) {
      const t = all.byTarget[tg];
      console.log(C.dim('    ' + tg.padEnd(8) + fmt(t.lines) + ' lines, ~' + fmt(t.savedTokens) + ' tokens'));
    }
  }
  console.log(C.dim('  estimate: had the model written the reply in the target language instead,\n' +
    '  the same content would cost ratio× the tokens (EN ~4 chars/token; ratios per\n' +
    '  language in MOTIVATION.md). The overlay keeps the session 100% English.'));
}

function cacheCmd(rest) {
  const sub = rest[0];
  const st = getState();
  const capBytes = (st.cacheMaxMB || 200) * 1024 * 1024;
  if (sub && sub !== 'clear' && sub !== 'gc') {
    console.error('usage: cctrans cache [clear|gc]');
    process.exit(1);
  }
  if (sub === 'clear') {
    let n = 0;
    try {
      for (const f of fs.readdirSync(CACHE_DIR)) {
        if (f.endsWith('.txt')) { try { fs.unlinkSync(path.join(CACHE_DIR, f)); n++; } catch (e) {} }
      }
    } catch (e) {}
    console.log(C.green('✓') + ' cleared ' + n + ' cached translations');
    return;
  }
  if (sub === 'gc') {
    const n = gcCache(capBytes);
    console.log(C.green('✓') + ' cache gc: deleted ' + n + ' oldest entries' + C.dim(' (cap ' + (st.cacheMaxMB || 200) + ' MB)'));
    return;
  }
  const s = cacheStats();
  console.log(C.bold('translation cache') + C.dim('  ' + CACHE_DIR));
  console.log('  entries : ' + s.files.toLocaleString('en-US'));
  console.log('  size    : ' + (s.bytes / 1024 / 1024).toFixed(1) + ' MB' + C.dim('  (cap ' + (st.cacheMaxMB || 200) + ' MB — enforced daily; set cacheMaxMB in state.json)'));
  if (s.oldestMs) console.log('  oldest  : ' + new Date(s.oldestMs).toISOString().slice(0, 10));
  console.log(C.dim('  cctrans cache clear — delete all · cctrans cache gc — enforce the cap now'));
}

function colorizeForTerminal(displayContent, marker) {
  // Match the marker after optional structure prefixes too ("## ↳", "> ↳",
  // list-indent "  ↳") so grouped section blocks color consistently.
  const zhLine = new RegExp('^\\s*(?:#{1,6}\\s+|(?:>\\s*)+)?\\s*' + marker.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return displayContent
    .split('\n')
    .map((l) => (zhLine.test(l) ? C.cyan(l) : l))
    .join('\n');
}

async function renderText(text) {
  const st = getState(process.cwd());
  let displayContent;
  if (st.mode === 'section' || st.mode === 'message') {
    // The whole text is one final delta, so `cctrans test`/`last` exercise
    // section/message mode end-to-end.
    const planned = planSections(text, {
      inFence: false, buf: [], target: st.target, final: true,
      granularity: st.mode === 'message' ? 'message' : 'section',
    });
    displayContent = await renderSections(planned, {
      target: st.target, backend: st.backend, model: st.model, marker: st.marker, timeoutMs: 12000,
    });
  } else {
    // final:true so a trailing markdown table flushes its translated copy.
    displayContent = (await buildDisplayContent(text, {
      target: st.target, backend: st.backend, model: st.model, marker: st.marker,
      display: st.display, timeoutMs: 12000, final: true,
    })).displayContent;
  }
  if (displayContent == null) { process.stdout.write(text + '\n'); return; }
  process.stdout.write(colorizeForTerminal(displayContent, st.marker) + '\n');
}

async function last(nBack) {
  const file = findTranscript(process.cwd());
  if (!file) { console.error(C.red('no transcript found for this directory')); process.exit(1); }
  const { text, total, index } = extractReply(file, nBack || 0);
  if (!text) { console.error(C.dim('(no assistant reply ' + (nBack ? nBack + ' turns back' : '') + ' to translate)')); process.exit(0); }
  console.error(C.dim('# reply ' + index + '/' + (total - 1) + ' from ' + path.basename(file)));
  await renderText(text);
}

function help() {
  console.log(`${C.bold('cctrans')} — bilingual overlay for Claude Code

${C.bold('Control')}
  cctrans on | off | toggle      turn the inline translation on/off
  cctrans input on | off         (beta) translate non-English input to English (as context)
  cctrans input threshold <n>    non-Latin chars that trigger input translation (default 4)
  cctrans status                 show current state
  cctrans lang [code]            show/set target language (zh-Hans, zh-Hant, ja, ko, ru, hi, es, pt, fr, de)
  cctrans mode [line|section|message]  layout: per line / per block / whole reply
  cctrans display [append|replace]     show ZH under the English, or in place of it (line mode)
  cctrans backend <id>           choose translation engine
  cctrans backends               list engines + availability

${C.bold('Diagnostics')}
  cctrans doctor                 diagnose: hooks, CC version, backends, keys, last hook error
  cctrans stats                  lines translated + estimated main-loop tokens saved
  cctrans cache [clear|gc]       translation-cache size / clear / enforce the size cap

${C.bold('Setup')}
  cctrans install                register hooks (+ link cctrans), then run setup
  cctrans setup                  interactive wizard: language, display mode, backend, API keys
                            (flags: --lang --mode --display --backend --key --input --yes)
  cctrans key [id] [value]       manage API keys in ~/.cc-translate/keys.json
                            (ids: openai, anthropic, deepl, azure, azure-region)
  cctrans uninstall              remove the hooks

${C.bold('Manual / test')}
  cctrans last [N]               translate the latest (or N-back) assistant reply
  cctrans test <text...>         translate ad-hoc English text
  cctrans --version              print the installed version

${C.dim('Tips: toggle from inside Claude Code by typing  !cctrans off  /  !cctrans on')}
${C.dim('Per-project overrides: a .cc-translate.json at the repo root (e.g. {"target":"ja"}')}
${C.dim('or {"enabled":false}) overrides the global settings for that project.')}`);
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case 'on': setState({ enabled: true }); sweepMsgState(24 * 60 * 60 * 1000); maybeGcCache(); console.log(C.green('✓ translation ON')); noteProjectOverride('enabled', true); break;
    case 'off': setState({ enabled: false }); sweepMsgState(0); maybeGcCache(); console.log('✓ translation ' + C.red('OFF')); noteProjectOverride('enabled', false); break;
    case 'toggle': { const s = getState(); const n = setState({ enabled: !s.enabled }); console.log('✓ translation ' + (n.enabled ? C.green('ON') : C.red('OFF'))); noteProjectOverride('enabled', n.enabled); break; }
    case 'backend': {
      const id = rest[0];
      const b = id && getBackend(id);
      if (!b) {
        console.error('usage: cctrans backend <' + listBackends().map((x) => x.id).join('|') + '>');
        process.exit(1);
      }
      setState({ backend: id });
      console.log(C.green('✓') + ' backend = ' + id + (b.available() ? '' : C.red('  (warning — missing: ' + b.needs + '; will fall back to google)')));
      break;
    }
    case 'backends': backends(); break;
    case 'mode': {
      const m = rest[0];
      if (!m) {
        const st = getState();
        console.log('mode = ' + st.mode);
        for (const mm of MODES) console.log(C.dim('  ' + mm.padEnd(9) + MODE_DESC[mm]));
        noteProjectOverride('mode', st.mode);
        break;
      }
      if (!MODES.includes(m)) { console.error('usage: cctrans mode <' + MODES.join('|') + '>'); process.exit(1); }
      setState({ mode: m });
      console.log(C.green('✓') + ' mode = ' + m + C.dim('  (' + MODE_DESC[m] + ')'));
      noteProjectOverride('mode', m);
      break;
    }
    case 'display': {
      const d = rest[0];
      if (!d) {
        const st = getState();
        console.log('display = ' + st.display);
        for (const dd of DISPLAYS) console.log(C.dim('  ' + dd.padEnd(9) + DISPLAY_DESC[dd]));
        noteProjectOverride('display', st.display);
        break;
      }
      if (!DISPLAYS.includes(d)) { console.error('usage: cctrans display <' + DISPLAYS.join('|') + '>'); process.exit(1); }
      const n = setState({ display: d });
      console.log(C.green('✓') + ' display = ' + d + C.dim('  (' + DISPLAY_DESC[d] + ')') +
        (d === 'replace' && n.mode !== 'line' ? C.red('  (note: replace only takes effect in line mode; current mode is ' + n.mode + ')') : ''));
      noteProjectOverride('display', d);
      break;
    }
    case 'lang': {
      const code = rest[0];
      if (!code) {
        const st = getState();
        console.log('lang = ' + st.target + C.dim('  (available: ' + listLangs().join(', ') + '; aliases: zh-CN, zh-TW)'));
        noteProjectOverride('target', st.target);
        break;
      }
      const lang = getLang(code);
      if (!lang) { console.error('unsupported lang: ' + code + '\navailable: ' + listLangs().join(', ') + ' (aliases: zh-CN, zh-TW)'); process.exit(1); }
      const canonical = normalizeLang(code);
      setState({ target: canonical });
      console.log(C.green('✓') + ' lang = ' + canonical + C.dim('  (' + lang.name + (canonical !== code ? ', normalized from ' + code : '') + ')'));
      break;
    }
    case 'install': {
      install();
      if (process.stdin.isTTY && !rest.includes('--no-setup')) {
        console.log('');
        if (!(await require('../src/setup').runSetup({}))) process.exit(1);
      }
      break;
    }
    case 'setup': {
      const flag = (name) => { const i = rest.indexOf(name); return i > -1 ? rest[i + 1] : undefined; };
      const okSetup = await require('../src/setup').runSetup({
        lang: flag('--lang'),
        mode: flag('--mode'),
        display: flag('--display'),
        backend: flag('--backend'),
        key: flag('--key'),
        input: flag('--input'),
        yes: rest.includes('--yes'),
      });
      if (!okSetup) process.exit(1); // scripted setup must be able to detect validation failures
      break;
    }
    case 'key': keyCmd(rest); break;
    case 'input': {
      const sub = rest[0];
      if (sub === 'on' || sub === 'off') setState({ inputEn: sub === 'on' });
      else if (sub === 'toggle') setState({ inputEn: !getState().inputEn });
      else if (sub === 'threshold' && rest[1] !== undefined) {
        const n = parseInt(rest[1], 10);
        if (!Number.isInteger(n) || n < 1) {
          console.error('usage: cctrans input threshold <n>   (non-Latin chars in a prompt that trigger translation; n >= 1)');
          process.exit(1);
        }
        setState({ inputMinChars: n });
      }
      const st = getState();
      console.log('input translation ' + C.dim('(beta)') + ' (prompt -> English): ' + (st.inputEn ? C.green('ON') : C.red('OFF')) +
        C.dim('  threshold: ' + st.inputMinChars + ' non-Latin chars (set: cctrans input threshold <n>)') +
        (inputHookInstalled() ? '' : C.red('  (hook not installed — run: cctrans install)')));
      break;
    }
    case 'uninstall': uninstall(); break;
    case 'status': status(); break;
    case 'doctor': await doctor(); break;
    case 'stats': statsCmd(); break;
    case 'cache': cacheCmd(rest); break;
    case 'last': await last(parseInt(rest[0], 10) || 0); break;
    case 'test': {
      const text = rest.join(' ');
      if (!text) { console.error('usage: cctrans test <text>'); process.exit(1); }
      await renderText(text); break;
    }
    case 'version': case '--version': case '-v': console.log(VERSION); break;
    case 'help': case '--help': case '-h': case undefined: help(); break;
    default: console.error('unknown command: ' + cmd + '\n'); help(); process.exit(1);
  }
}

main().catch((e) => { console.error(C.red('error: ') + (e && e.message)); process.exit(1); });
