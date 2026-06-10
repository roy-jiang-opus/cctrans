'use strict';
// Interactive setup wizard: language -> backend -> API-key entry -> input
// translation (beta) -> live verification -> save. Re-runnable via `cctrans
// setup`; non-interactive with flags (--lang, --backend, --key, --input,
// --yes). Keys go to keys.json only — the shell environment is never read.

const readline = require('node:readline/promises');
const { getState, setState } = require('./config');
const { listLangs, getLang, normalizeLang } = require('./langs');
const { listBackends, getBackend } = require('./backends');
const keys = require('./keys');
const { buildDisplayContent } = require('./interleave');

const C = {
  dim: (s) => '\x1b[2m' + s + '\x1b[0m',
  cyan: (s) => '\x1b[36m' + s + '\x1b[0m',
  green: (s) => '\x1b[32m' + s + '\x1b[0m',
  red: (s) => '\x1b[31m' + s + '\x1b[0m',
  bold: (s) => '\x1b[1m' + s + '\x1b[0m',
};

async function runSetup(opts) {
  opts = opts || {};
  const interactive = !opts.yes && process.stdin.isTTY;
  const rl = interactive
    ? readline.createInterface({ input: process.stdin, output: process.stdout })
    : null;
  const ask = async (q, def) => {
    if (!rl) return def;
    const a = (await rl.question(q + (def ? C.dim(' [' + def + '] ') : ' '))).trim();
    return a || def;
  };

  try {
    console.log(C.bold('cctrans setup') + C.dim('  (re-run anytime: cctrans setup)'));

    // 1. Target language
    let lang = opts.lang;
    if (!lang) {
      const codes = listLangs();
      console.log('\n' + C.bold('Target language') + ' — translations appear under each English line:');
      codes.forEach((c, i) => console.log('  ' + (i + 1) + '. ' + c.padEnd(8) + C.dim(getLang(c).name)));
      const cur = getState().target;
      const a = await ask('Pick a number or code', cur);
      lang = /^\d+$/.test(a) ? codes[parseInt(a, 10) - 1] : a;
    }
    if (!getLang(lang)) { console.error(C.red('unsupported language: ' + lang)); return false; }
    lang = normalizeLang(lang);

    // 2. Backend
    let backend = opts.backend;
    if (!backend) {
      console.log('\n' + C.bold('Translation backend') + ':');
      for (const b of listBackends()) {
        console.log('  ' + b.id.padEnd(12) + (b.available() ? C.green('ready  ') : C.red('no key ')) + C.dim(b.needs));
      }
      const def = getState().backend && getBackend(getState().backend) && getBackend(getState().backend).available()
        ? getState().backend
        : (getBackend('openai').available() ? 'openai' : 'google');
      backend = await ask('Pick a backend', def);
    }
    const b = getBackend(backend);
    if (!b) { console.error(C.red('unknown backend: ' + backend)); return false; }

    // 3. Key entry for the chosen backend, if missing (keys live ONLY in
    //    keys.json — shell env vars are never read)
    if (!b.available() && keys.KEY_IDS.includes(b.id)) {
      const v = opts.key || (await ask('Paste your ' + b.id + ' API key (enter to skip)', ''));
      if (v) { keys.setKey(b.id, v); console.log(C.green('✓') + ' key saved to ' + keys.KEYS_FILE + C.dim(' (chmod 600)')); }
      if (b.id === 'azure' && !keys.getKey('azure-region')) {
        const r = await ask('Azure region (enter to skip)', '');
        if (r) keys.setKey('azure-region', r);
      }
    }

    // 4. Input translation (beta, opt-in): prompt -> English as context
    let inputEn = typeof opts.input === 'string' ? opts.input === 'on' : getState().inputEn;
    if (opts.input === undefined && rl) {
      console.log('\n' + C.bold('Input translation') + ' ' + C.dim('(beta)') +
        ' — type prompts in your language; an English translation is\n' +
        'attached as context and the model is asked to reply in English (the original\n' +
        'prompt stays in your history; adds ~0.5–1.5s per non-English prompt).');
      const a = await ask('Enable input translation? (y/N)', inputEn ? 'y' : 'n');
      inputEn = /^y(es)?$/i.test(a);
    }

    // 5. Save config
    setState({ target: lang, backend, inputEn });
    console.log('\n' + C.green('✓') + ' saved: lang=' + lang + ' (' + getLang(lang).name + '), backend=' + backend +
      ', input=' + (inputEn ? 'on' : 'off') +
      (b.available() ? '' : C.red('  (no key yet — will fall back to google)')));

    // 6. Live verification
    process.stdout.write(C.dim('verifying… '));
    try {
      const { displayContent } = await buildDisplayContent('Setup verification: translation works.\n', {
        target: lang, backend, timeoutMs: 12000,
      });
      console.log('\n' + (displayContent || C.red('(nothing translated — check the backend)')));
    } catch (e) {
      console.log(C.red('verification failed: ' + e.message));
    }

    console.log(C.dim('\nNext: restart Claude Code (new session). Toggle with `!cctrans off` / `!cctrans on`. ' +
      (inputEn
        ? 'Input translation (beta) is ON — disable: `cctrans input off`.'
        : 'Input translation (beta): `cctrans input on`.')));
    return true;
  } finally {
    if (rl) rl.close();
  }
}

module.exports = { runSetup };
