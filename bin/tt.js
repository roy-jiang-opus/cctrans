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

const HOOK_PATH = path.resolve(__dirname, '..', 'hook', 'message-display.js');
const SETTINGS = path.join(os.homedir(), '.claude', 'settings.json');

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

function install() {
  const s = readSettings();
  s.hooks = s.hooks || {};
  s.hooks.MessageDisplay = s.hooks.MessageDisplay || [];
  if (hookInstalled(s)) {
    console.log(C.green('✓') + ' hook already registered in ' + SETTINGS);
  } else {
    s.hooks.MessageDisplay.push({ hooks: [{ type: 'command', command: 'node ' + HOOK_PATH }] });
    writeSettings(s);
    console.log(C.green('✓') + ' registered MessageDisplay hook in ' + SETTINGS);
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
  if (s.hooks && Array.isArray(s.hooks.MessageDisplay)) {
    s.hooks.MessageDisplay = s.hooks.MessageDisplay.filter((g) => !JSON.stringify(g).includes('message-display.js'));
    if (s.hooks.MessageDisplay.length === 0) delete s.hooks.MessageDisplay;
    if (s.hooks && Object.keys(s.hooks).length === 0) delete s.hooks;
    writeSettings(s);
  }
  console.log(C.green('✓') + ' removed the MessageDisplay hook. Restart Claude Code to take effect.');
}

function status() {
  const st = getState();
  const installed = hookInstalled();
  const keyOpenai = !!process.env.OPENAI_API_KEY;
  console.log(C.bold('terminal-translate status'));
  console.log('  enabled : ' + (st.enabled ? C.green('ON') : C.red('OFF')));
  console.log('  hook    : ' + (installed ? C.green('installed') : C.red('not installed') + C.dim('  (run: tt install)')));
  console.log('  backend : ' + st.backend + (st.backend === 'openai' ? (keyOpenai ? C.dim('  (OPENAI_API_KEY found)') : C.red('  (OPENAI_API_KEY missing!)')) : C.dim('  (free, no key)')));
  console.log('  target  : ' + st.target);
  console.log('  model   : ' + st.model + C.dim('  (openai backend only)'));
  console.log('  state   : ' + STATE_FILE);
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
  console.log(`${C.bold('tt')} — Claude Code bilingual (English + 中文) overlay

${C.bold('Control')}
  tt on | off | toggle      turn the inline translation on/off
  tt status                 show current state
  tt backend <openai|google>  choose translation engine

${C.bold('Setup')}
  tt install                register the MessageDisplay hook (+ link tt)
  tt uninstall              remove the hook

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
      const b = rest[0];
      if (b !== 'openai' && b !== 'google') { console.error('usage: tt backend <openai|google>'); process.exit(1); }
      setState({ backend: b }); console.log(C.green('✓') + ' backend = ' + b); break;
    }
    case 'install': install(); break;
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
