'use strict';
// Setup wizard. Interactive mode is a back/forward arrow-key wizard ending in
// an editable review screen (src/prompt.js, zero-dep):
//   - each step: ↑/↓ choose · Enter/→ next · ←/Backspace back · Ctrl-C cancel
//   - review: ↑/↓ over the chosen settings + Save; Enter on a setting jumps back
//     to re-pick it (returning to review); Enter/S on Save writes + verifies.
// Non-interactive (--yes / no TTY / flags drive it): apply flags then the
// current state and save directly, no UI, never hanging. Keys go to keys.json
// only — the shell environment is never read.

const { getState, setState, MODES, DISPLAYS } = require('./config');
const { listLangs, getLang, normalizeLang } = require('./langs');
const { listBackends, getBackend } = require('./backends');
const keys = require('./keys');
const { buildDisplayContent } = require('./interleave');
const { select, question, C, BACK } = require('./prompt');

const STEP_FOOTER = '↑/↓ select · Enter next · ← back · Ctrl-C cancel';
const EDIT_FOOTER = '↑/↓ select · Enter confirm · ← cancel edit';

// Each step: title, applies-to-draft predicate, a one-line summary for the
// review screen, whether the linear pass should skip it, and run() which shows
// a picker and writes the choice into the draft (or returns BACK unchanged).
function steps() {
  return [
    {
      id: 'lang', title: 'Language',
      applicable: () => true,
      summary: (d) => d.lang + C.dim('  (' + getLang(d.lang).name + ')'),
      run: async (d, footer) => {
        const v = await select({
          title: '\n' + C.bold('Target language') + C.dim(' — replies show English + your language inline'),
          footer,
          options: listLangs().map((c) => ({ label: c.padEnd(8), hint: getLang(c).name, value: c })),
          initialValue: d.lang, allowBack: true,
        });
        if (v === BACK) return BACK;
        d.lang = normalizeLang(v);
      },
    },
    {
      id: 'mode', title: 'Mode',
      applicable: () => true,
      summary: (d) => d.mode,
      run: async (d, footer) => {
        const v = await select({
          title: '\n' + C.bold('Display mode'),
          footer,
          options: [
            { label: 'line   ', hint: 'translation under each English line, as it streams', value: 'line' },
            { label: 'section', hint: 'English block first, then its translation when the block completes', value: 'section' },
            { label: 'message', hint: 'whole reply first, one grouped translation at the very end', value: 'message' },
          ],
          initialValue: d.mode, allowBack: true,
        });
        if (v === BACK) return BACK;
        d.mode = v;
      },
    },
    {
      id: 'display', title: 'Translated line',
      applicable: (d) => d.mode === 'line', // only meaningful in line mode
      summary: (d) => d.display,
      run: async (d, footer) => {
        const v = await select({
          title: '\n' + C.bold('Translated line'),
          footer,
          options: [
            { label: 'append ', hint: 'show the translation under each English line (bilingual)', value: 'append' },
            { label: 'replace', hint: 'show only the translation, in place of the English', value: 'replace' },
          ],
          initialValue: d.display, allowBack: true,
        });
        if (v === BACK) return BACK;
        d.display = v;
      },
    },
    {
      id: 'backend', title: 'Backend',
      applicable: () => true,
      summary: (d) => {
        const b = getBackend(d.backend);
        return d.backend + (b && keys.KEY_IDS.includes(b.id) ? '  ' + (b.available() ? C.green('✓ key set') : C.red('needs key')) : '');
      },
      run: async (d, footer) => {
        const v = await select({
          title: '\n' + C.bold('Translation backend'),
          footer,
          options: listBackends().map((b) => ({
            label: b.id.padEnd(12),
            hint: (b.available() ? C.green('ready') : 'needs key') + ' · ' + b.needs,
            value: b.id,
          })),
          initialValue: d.backend, allowBack: true,
        });
        if (v === BACK) return BACK;
        d.backend = v;
      },
    },
    {
      id: 'key', title: 'API key',
      applicable: (d) => { const b = getBackend(d.backend); return !!(b && keys.KEY_IDS.includes(b.id)); },
      skipInLinear: (d) => getBackend(d.backend).available(), // don't nag if a key is already set
      summary: (d) => (getBackend(d.backend).available() ? C.green('✓ set') : C.red('not set')),
      run: async (d) => {
        const b = getBackend(d.backend);
        const v = await question('\nPaste your ' + b.id + ' API key (Enter to skip)', '');
        if (v) { keys.setKey(b.id, v); console.log(C.green('✓') + ' key saved to ' + keys.KEYS_FILE + C.dim(' (chmod 600)')); }
        if (b.id === 'azure' && !keys.getKey('azure-region')) {
          const r = await question('Azure region (Enter to skip)', '');
          if (r) keys.setKey('azure-region', r);
        }
      },
    },
    {
      id: 'input', title: 'Input',
      applicable: () => true,
      summary: (d) => (d.inputEn ? 'on ' + C.dim('(beta)') : 'off'),
      run: async (d, footer) => {
        const v = await select({
          title: '\n' + C.bold('Input translation') + ' ' + C.dim('(beta)') +
            C.dim(' — translate your non-English prompts to English first (+~0.5–1.5s/prompt)'),
          footer,
          options: [
            { label: 'off       ', hint: 'send prompts as you type them', value: false },
            { label: 'on (beta) ', hint: 'translate non-English prompts to English first', value: true },
          ],
          initialValue: d.inputEn, allowBack: true,
        });
        if (v === BACK) return BACK;
        d.inputEn = v;
      },
    },
  ];
}

// Linear forward/back pass, then the editable review loop.
async function runWizard(draft) {
  const all = steps();
  const live = (s) => s.applicable(draft) && !(s.skipInLinear && s.skipInLinear(draft));

  // Phase 1 — linear, with back navigation.
  let i = 0;
  while (i < all.length) {
    if (!live(all[i])) { i++; continue; }
    const r = await all[i].run(draft, STEP_FOOTER);
    if (r === BACK) {
      let j = i - 1;
      while (j >= 0 && !live(all[j])) j--;
      i = j >= 0 ? j : i; // BACK on the first step stays put
    } else {
      i++;
    }
  }

  // Phase 2 — editable review.
  while (true) {
    const fields = all.filter((s) => s.applicable(draft));
    const options = fields.map((s) => ({ label: s.title.padEnd(9), hint: s.summary(draft), value: s.id }));
    options.push({ sep: true, label: '  ' + C.dim('─'.repeat(40)) });
    options.push({ label: C.green('✅ Save and start translating'), value: '__save__', hotkey: 's' });
    const pick = await select({
      title: '\n' + C.bold('Review your settings'),
      footer: '↑/↓ move · Enter edit · S save · Ctrl-C cancel',
      options, initialValue: '__save__',
    });
    if (pick === '__save__') return;
    const step = all.find((s) => s.id === pick);
    if (step) await step.run(draft, EDIT_FOOTER); // BACK just returns to review unchanged
  }
}

async function runSetup(opts) {
  opts = opts || {};
  const interactive = !opts.yes && process.stdin.isTTY;
  const st0 = getState();

  // Draft seeded from flags, then current state.
  const draft = {
    lang: opts.lang ? normalizeLang(opts.lang) : st0.target,
    mode: opts.mode || st0.mode,
    display: opts.display || st0.display,
    backend: opts.backend || st0.backend,
    inputEn: typeof opts.input === 'string' ? opts.input === 'on' : st0.inputEn,
  };
  // Validate any flag-provided values up front (fail fast, both modes).
  if (!getLang(draft.lang)) { console.error(C.red('unsupported language: ' + draft.lang)); return false; }
  if (!MODES.includes(draft.mode)) { console.error(C.red('unknown mode: ' + draft.mode + ' (available: ' + MODES.join(', ') + ')')); return false; }
  if (!DISPLAYS.includes(draft.display)) { console.error(C.red('unknown display: ' + draft.display + ' (available: ' + DISPLAYS.join(', ') + ')')); return false; }
  if (!getBackend(draft.backend)) { console.error(C.red('unknown backend: ' + draft.backend)); return false; }

  console.log(C.bold('cctrans setup') + C.dim('  (re-run anytime: cctrans setup)'));

  if (interactive) {
    await runWizard(draft);
  } else if (opts.key) {
    // Non-interactive key entry for the chosen backend.
    const b = getBackend(draft.backend);
    if (b && keys.KEY_IDS.includes(b.id)) keys.setKey(b.id, opts.key);
  }

  const b = getBackend(draft.backend);
  setState({ target: draft.lang, mode: draft.mode, display: draft.display, backend: draft.backend, inputEn: draft.inputEn });
  console.log('\n' + C.green('✓') + ' saved: lang=' + draft.lang + ' (' + getLang(draft.lang).name + '), mode=' + draft.mode +
    ', display=' + draft.display + ', backend=' + draft.backend + ', input=' + (draft.inputEn ? 'on' : 'off') +
    (b.available() ? '' : C.red('  (no key yet — will fall back to google)')));

  // Live verification.
  process.stdout.write(C.dim('verifying… '));
  try {
    const { displayContent } = await buildDisplayContent('Setup verification: translation works.\n', {
      target: draft.lang, backend: draft.backend, timeoutMs: 12000,
    });
    console.log('\n' + (displayContent || C.red('(nothing translated — check the backend)')));
  } catch (e) {
    console.log(C.red('verification failed: ' + e.message));
  }

  console.log(C.dim('\nNext: restart Claude Code (new session). Toggle with `!cctrans off` / `!cctrans on`. ' +
    (draft.inputEn
      ? 'Input translation (beta) is ON — disable: `cctrans input off`.'
      : 'Input translation (beta): `cctrans input on`.')));
  return true;
}

module.exports = { runSetup };
