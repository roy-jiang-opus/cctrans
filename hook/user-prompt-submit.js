'use strict';
// Claude Code UserPromptSubmit hook: input translation (prompt -> English).
//
// stdin (JSON): { session_id, transcript_path, cwd, permission_mode,
//                 hook_event_name, prompt }
// stdout (JSON, exit 0): { hookSpecificOutput: { hookEventName:
//   "UserPromptSubmit", additionalContext: "<English translation>" } }
//
// VERIFIED CONSTRAINT (CC 2.1.169 binary): neither UserPromptSubmit nor
// UserPromptExpansion can REWRITE the prompt — their output schema only
// allows additionalContext (and block). So we attach the English translation
// as context the model treats as canonical; the original stays in history.
//
// Safety contract: on disabled / English input / error / timeout, emit
// NOTHING and exit 0 — the prompt goes through untouched.

const { getState } = require('../src/config');
const { translateLines } = require('../src/translate');
const { nonLatinRatio } = require('../src/langs');

function passThrough() { process.exit(0); }

let data = '';
process.stdin.on('data', (d) => (data += d));
process.stdin.on('end', async () => {
  if (process.env.CCTRANS_DEBUG_STDIN) {
    try { require('fs').appendFileSync(process.env.CCTRANS_DEBUG_STDIN, '\n===== prompt =====\n' + data + '\n'); } catch (e) {}
  }
  if (process.env.CCTRANS_DISABLE) return passThrough();

  let inp = {};
  try { inp = JSON.parse(data); } catch (e) { return passThrough(); }
  const prompt = typeof inp.prompt === 'string' ? inp.prompt : '';
  if (!prompt.trim() || prompt.length > 6000) return passThrough();

  let st;
  try { st = getState(); } catch (e) { return passThrough(); }
  if (!st.inputEn) return passThrough();

  // Only act on prompts that are substantially non-English.
  if (nonLatinRatio(prompt) < 0.2) return passThrough();

  const guard = setTimeout(passThrough, 9000);
  try {
    const [en] = await translateLines([prompt], {
      target: 'en', backend: st.backend, model: st.model, timeoutMs: 8000,
    });
    clearTimeout(guard);
    if (!en || en.trim() === prompt.trim()) return passThrough();
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext:
          'English translation of the user\'s prompt (translated by a local tool; ' +
          'treat it as the canonical instruction):\n' + en,
      },
    }));
    process.exit(0);
  } catch (e) {
    clearTimeout(guard);
    return passThrough();
  }
});
