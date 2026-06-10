'use strict';
// Interactive setup wizard: language -> display mode -> append/replace ->
// backend -> API-key entry -> input translation (beta) -> live verification ->
// save. Menu steps use arrow-key selection (src/prompt.js, zero-dep); the
// API-key step is a text question. Re-runnable via `cctrans setup`;
// non-interactive with flags (--lang, --mode, --display, --backend, --key,
// --input, --yes). Keys go to keys.json only — the shell environment is never read.

const { getState, setState, MODES, DISPLAYS } = require('./config');
const { listLangs, getLang, normalizeLang } = require('./langs');
const { listBackends, getBackend } = require('./backends');
const keys = require('./keys');
const { buildDisplayContent } = require('./interleave');
const { select, question, C } = require('./prompt');

async function runSetup(opts) {
  opts = opts || {};
  const interactive = !opts.yes && process.stdin.isTTY;
  const st0 = getState();

  console.log(C.bold('cctrans setup') + C.dim('  (re-run anytime: cctrans setup)') +
    (interactive ? C.dim('   ↑/↓ to choose · Enter to confirm') : ''));

  // 1. Target language
  let lang = opts.lang;
  if (!lang) {
    lang = interactive
      ? await select({
          title: '\n' + C.bold('Target language') + C.dim(' — replies show English + your language inline'),
          options: listLangs().map((c) => ({ label: c.padEnd(8), hint: getLang(c).name, value: c })),
          initialValue: st0.target,
        })
      : st0.target;
  }
  if (!getLang(lang)) { console.error(C.red('unsupported language: ' + lang)); return false; }
  lang = normalizeLang(lang);

  // 2. Display mode
  let mode = opts.mode;
  if (!mode) {
    mode = interactive
      ? await select({
          title: '\n' + C.bold('Display mode'),
          options: [
            { label: 'line   ', hint: 'translation under each English line, as it streams', value: 'line' },
            { label: 'section', hint: 'English block first, then its translation when the block completes', value: 'section' },
            { label: 'message', hint: 'whole reply first, one grouped translation at the very end', value: 'message' },
          ],
          initialValue: st0.mode,
        })
      : st0.mode;
  }
  if (!MODES.includes(mode)) { console.error(C.red('unknown mode: ' + mode + ' (available: ' + MODES.join(', ') + ')')); return false; }

  // 2b. Append vs replace (only meaningful in line mode)
  let display = opts.display;
  if (!display) {
    display = (interactive && mode === 'line')
      ? await select({
          title: '\n' + C.bold('Translated line'),
          options: [
            { label: 'append ', hint: 'show the translation under each English line (bilingual)', value: 'append' },
            { label: 'replace', hint: 'show only the translation, in place of the English', value: 'replace' },
          ],
          initialValue: st0.display,
        })
      : st0.display;
  }
  if (!DISPLAYS.includes(display)) { console.error(C.red('unknown display: ' + display + ' (available: ' + DISPLAYS.join(', ') + ')')); return false; }

  // 3. Backend
  let backend = opts.backend;
  if (!backend) {
    const def = st0.backend && getBackend(st0.backend) && getBackend(st0.backend).available()
      ? st0.backend
      : (getBackend('openai').available() ? 'openai' : 'google');
    backend = interactive
      ? await select({
          title: '\n' + C.bold('Translation backend'),
          options: listBackends().map((b) => ({
            label: b.id.padEnd(12),
            hint: (b.available() ? C.green('ready') : 'needs key') + ' · ' + b.needs,
            value: b.id,
          })),
          initialValue: def,
        })
      : def;
  }
  const b = getBackend(backend);
  if (!b) { console.error(C.red('unknown backend: ' + backend)); return false; }

  // 4. Key entry for the chosen backend, if missing (keys live ONLY in keys.json)
  if (!b.available() && keys.KEY_IDS.includes(b.id)) {
    const v = opts.key || (interactive ? await question('\nPaste your ' + b.id + ' API key (Enter to skip)', '') : '');
    if (v) { keys.setKey(b.id, v); console.log(C.green('✓') + ' key saved to ' + keys.KEYS_FILE + C.dim(' (chmod 600)')); }
    if (b.id === 'azure' && !keys.getKey('azure-region')) {
      const r = interactive ? await question('Azure region (Enter to skip)', '') : '';
      if (r) keys.setKey('azure-region', r);
    }
  }

  // 5. Input translation (beta, opt-in): prompt -> English as context
  let inputEn = typeof opts.input === 'string' ? opts.input === 'on' : st0.inputEn;
  if (opts.input === undefined && interactive) {
    inputEn = await select({
      title: '\n' + C.bold('Input translation') + ' ' + C.dim('(beta)') +
        C.dim(' — type prompts in your language; an English translation is attached\n') +
        C.dim('as context and the model is asked to reply in English (+~0.5–1.5s per non-English prompt)'),
      options: [
        { label: 'off       ', hint: 'send prompts as you type them', value: false },
        { label: 'on (beta) ', hint: 'translate non-English prompts to English first', value: true },
      ],
      initialValue: st0.inputEn,
    });
  }

  // 6. Save config
  setState({ target: lang, mode, display, backend, inputEn });
  console.log('\n' + C.green('✓') + ' saved: lang=' + lang + ' (' + getLang(lang).name + '), mode=' + mode +
    ', display=' + display + ', backend=' + backend + ', input=' + (inputEn ? 'on' : 'off') +
    (b.available() ? '' : C.red('  (no key yet — will fall back to google)')));

  // 7. Live verification
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
}

module.exports = { runSetup };
