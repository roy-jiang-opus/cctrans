'use strict';
// Claude Code MessageDisplay hook entry point.
//
// stdin (JSON): { session_id, transcript_path, cwd, permission_mode,
//                 hook_event_name, turn_id, message_id, index, final, delta }
//   delta = the newly completed lines of the streaming assistant message.
//           Deltas are non-overlapping; a code fence (```) can span deltas.
// stdout (JSON, exit 0): { hookSpecificOutput: { hookEventName: "MessageDisplay",
//                          displayContent: "<EN line>\n↳ <ZH line> ..." } }
//   displayContent REPLACES the delta on screen. Display-only: the transcript
//   and the model's context keep the original English.
//
// Safety contract: on disabled / empty / error / timeout, emit NOTHING and
// exit 0 so Claude Code renders the original English delta unchanged. This hook
// must never break or stall the user's session.

const fs = require('fs');
const path = require('path');
const { getState, BASE } = require('../src/config');
const { buildDisplayContent } = require('../src/interleave');

function showOriginal() { process.exit(0); } // no stdout => CC keeps the original delta

// Per-message code-fence state, so "inside a ``` block?" carries across the
// deltas of one message. Reset at index 0 (also covers full repaints, which
// re-send the message from index 0); removed when the message completes.
const MSGDIR = path.join(BASE, 'msgstate');
function fenceFile(id) { return path.join(MSGDIR, String(id).replace(/[^\w.-]/g, '_') + '.json'); }
function loadFence(id, index) {
  if (!id || index === 0) return false;
  try { return !!JSON.parse(fs.readFileSync(fenceFile(id), 'utf8')).inFence; } catch (e) { return false; }
}
function saveFence(id, index, inFence, final) {
  if (!id) return;
  try {
    if (final) { try { fs.unlinkSync(fenceFile(id)); } catch (e) {} return; }
    fs.mkdirSync(MSGDIR, { recursive: true });
    fs.writeFileSync(fenceFile(id), JSON.stringify({ index, inFence }));
  } catch (e) {}
}

let data = '';
process.stdin.on('data', (d) => (data += d));
process.stdin.on('end', async () => {
  if (process.env.TT_DEBUG_STDIN) {
    try { fs.appendFileSync(process.env.TT_DEBUG_STDIN, '\n===== delta =====\n' + data + '\n'); } catch (e) {}
  }
  let inp = {};
  try { inp = JSON.parse(data); } catch (e) { return showOriginal(); }

  const delta = typeof inp.delta === 'string' ? inp.delta : '';
  if (!delta) return showOriginal();

  let st;
  try { st = getState(); } catch (e) { return showOriginal(); }
  if (!st.enabled) return showOriginal();

  const id = inp.message_id;
  const index = typeof inp.index === 'number' ? inp.index : 0;
  const final = inp.final === true;
  const inFence0 = loadFence(id, index);

  // Guard below Claude Code's 10s MessageDisplay timeout so we always exit clean.
  const guard = setTimeout(showOriginal, 9000);
  try {
    const { displayContent, inFence } = await buildDisplayContent(delta, {
      target: st.target, backend: st.backend, model: st.model,
      marker: st.marker, timeoutMs: 8000, inFence: inFence0,
    });
    clearTimeout(guard);
    saveFence(id, index, inFence, final); // persist even when nothing was translated
    if (displayContent == null) return showOriginal();
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: 'MessageDisplay', displayContent: displayContent },
    }));
    process.exit(0);
  } catch (e) {
    clearTimeout(guard);
    return showOriginal();
  }
});
