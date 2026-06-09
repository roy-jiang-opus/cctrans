#!/usr/bin/env node
'use strict';
// tt — control + test CLI for the Claude Code bilingual (EN->ZH) overlay.
//
//   tt on | off | toggle | status
//   tt backend <openai|google>
//   tt install | uninstall        register/remove the MessageDisplay hook
//   tt last [N]                    translate the latest (or Nth-back) reply -> stdout
//   tt test <text...>              translate ad-hoc text -> stdout
//   tt help

const fs = require('fs');
const os = require('os');
const path = require('path');

const { getState, setState, STATE_FILE } = require('../src/config');
const { buildDisplayContent } = require('../src/interleave');
const { findTranscript, extractReply } = require('../src/transcript');
const { listBackends, getBackend } = require('../src/backends');
const { getLang, listLangs, normalizeLang } = require('../src/langs');

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

function readSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS, 'utf8')); } catch (e) { return {}; }
}
function writeSettings(s) {
  try { fs.copyFileSync(SETTINGS, SETTINGS + '.bak-tt'); } catch (e) {}
  const tmp = SETTINGS + '.tt.tmp';
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
    // Registered always; the hook exits instantly unless `tt input on`.
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
  // Make `tt` runnable from anywhere (best-effort symlink on a common PATH dir).
  const linkDir = path.join(os.homedir(), '.local', 'bin');
  const link = path.join(linkDir, 'tt');
  try {
    fs.mkdirSync(linkDir, { recursive: true });
    try { fs.unlinkSync(link); } catch (e) {}
    fs.symlinkSync(path.resolve(__dirname, 'tt.js'), link);
    fs.chmodSync(path.resolve(__dirname, 'tt.js'), 0o755);
    console.log(C.green('✓') + ' linked `tt` -> ' + link + (process.env.PATH.includes(linkDir) ? '' : C.dim('  (add ' + linkDir + ' to PATH)')));
  } catch (e) {
    console.log(C.dim('  (could not symlink tt; add alias:  alias tt=\'node ' + path.resolve(__dirname, 'tt.js') + '\')'));
  }
  console.log('');
  console.log('Next:');
  console.log('  1. Restart Claude Code (new session) so the hook loads.');
  console.log('  2. Send any message — replies now show ' + C.bold('English + 中文') + ' inline.');
  console.log('  3. Toggle anytime:  ' + C.bold('!tt off') + ' / ' + C.bold('!tt on') + '  (typed inside Claude Code).');
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
  console.log(C.green('✓') + ' removed cctranslate hooks. Restart Claude Code to take effect.');
}

function status() {
  const st = getState();
  const installed = hookInstalled();
  const b = getBackend(st.backend);
  const lang = getLang(st.target);
  console.log(C.bold('cctranslate status'));
  console.log('  enabled : ' + (st.enabled ? C.green('ON') : C.red('OFF')));
  console.log('  hook    : ' + (installed ? C.green('installed') : C.red('not installed') + C.dim('  (run: tt install)')));
  console.log('  backend : ' + st.backend + (b ? (b.available() ? C.green('  (ready)') : C.red('  (missing: ' + b.needs + ')')) : C.red('  (unknown backend)')));
  console.log('  lang    : ' + st.target + (lang ? C.dim('  (' + lang.name + ')') : C.red('  (unsupported — see: tt lang)')));
  console.log('  input   : ' + (st.inputEn ? C.green('ON') : 'off') + C.dim('  (prompt -> English; toggle: tt input on|off)'));
  console.log('  keys    : ' + Object.keys(keys.readKeys()).length + ' in ' + keys.KEYS_FILE + C.dim('  (manage: tt key)'));
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
  console.log(C.bold('backends') + C.dim('  (switch: tt backend <id>)'));
  for (const b of listBackends()) {
    const mark = b.id === st.backend ? C.cyan('▶ ') : '  ';
    const ok = b.available() ? C.green('ready    ') : C.red('missing  ');
    console.log(mark + b.id.padEnd(12) + ok + C.dim('needs: ' + b.needs));
  }
}

function colorizeForTerminal(displayContent, marker) {
  return displayContent
    .split('\n')
    .map((l) => (l.startsWith(marker) ? C.cyan(l) : l))
    .join('\n');
}

async function renderText(text) {
  const st = getState();
  const { displayContent } = await buildDisplayContent(text, {
    target: st.target, backend: st.backend, model: st.model, marker: st.marker, timeoutMs: 12000,
  });
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
  console.log(`${C.bold('tt')} — cctranslate: bilingual overlay for Claude Code

${C.bold('Control')}
  tt on | off | toggle      turn the inline translation on/off
  tt input on | off         translate non-English input to English (as context)
  tt status                 show current state
  tt lang [code]            show/set target language (zh-Hans, zh-Hant, ja, ko, ru, hi)
  tt backend <id>           choose translation engine
  tt backends               list engines + availability

${C.bold('Setup')}
  tt install                register hooks (+ link tt), then run setup
  tt setup                  interactive wizard: language, backend, API keys
                            (flags: --lang --backend --key --yes)
  tt key [id] [value]       manage API keys in ~/.cc-translate/keys.json
                            (ids: openai, anthropic, deepl, azure, azure-region)
  tt uninstall              remove the hooks

${C.bold('Manual / test')}
  tt last [N]               translate the latest (or N-back) assistant reply
  tt test <text...>         translate ad-hoc English text

${C.dim('Tip: toggle from inside Claude Code by typing  !tt off  /  !tt on')}`);
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case 'on': setState({ enabled: true }); console.log(C.green('✓ translation ON')); break;
    case 'off': setState({ enabled: false }); console.log('✓ translation ' + C.red('OFF')); break;
    case 'toggle': { const s = getState(); const n = setState({ enabled: !s.enabled }); console.log('✓ translation ' + (n.enabled ? C.green('ON') : C.red('OFF'))); break; }
    case 'backend': {
      const id = rest[0];
      const b = id && getBackend(id);
      if (!b) {
        console.error('usage: tt backend <' + listBackends().map((x) => x.id).join('|') + '>');
        process.exit(1);
      }
      setState({ backend: id });
      console.log(C.green('✓') + ' backend = ' + id + (b.available() ? '' : C.red('  (warning — missing: ' + b.needs + '; will fall back to google)')));
      break;
    }
    case 'backends': backends(); break;
    case 'lang': {
      const code = rest[0];
      if (!code) { const st = getState(); console.log('lang = ' + st.target + C.dim('  (available: ' + listLangs().join(', ') + '; aliases: zh-CN, zh-TW)')); break; }
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
        await require('../src/setup').runSetup({});
      }
      break;
    }
    case 'setup': {
      const flag = (name) => { const i = rest.indexOf(name); return i > -1 ? rest[i + 1] : undefined; };
      await require('../src/setup').runSetup({
        lang: flag('--lang'),
        backend: flag('--backend'),
        key: flag('--key'),
        yes: rest.includes('--yes'),
      });
      break;
    }
    case 'key': keyCmd(rest); break;
    case 'input': {
      const sub = rest[0];
      if (sub === 'on' || sub === 'off') setState({ inputEn: sub === 'on' });
      else if (sub === 'toggle') setState({ inputEn: !getState().inputEn });
      const st = getState();
      console.log('input translation (prompt -> English): ' + (st.inputEn ? C.green('ON') : C.red('OFF')) +
        (inputHookInstalled() ? '' : C.red('  (hook not installed — run: tt install)')));
      break;
    }
    case 'uninstall': uninstall(); break;
    case 'status': status(); break;
    case 'last': await last(parseInt(rest[0], 10) || 0); break;
    case 'test': {
      const text = rest.join(' ');
      if (!text) { console.error('usage: tt test <text>'); process.exit(1); }
      await renderText(text); break;
    }
    case 'help': case '--help': case '-h': case undefined: help(); break;
    default: console.error('unknown command: ' + cmd + '\n'); help(); process.exit(1);
  }
}

main().catch((e) => { console.error(C.red('error: ') + (e && e.message)); process.exit(1); });
