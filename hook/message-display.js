'use strict';
// Claude Code MessageDisplay hook entry point.
//
// stdin (JSON): { session_id, transcript_path, cwd, permission_mode,
//                 hook_event_name, turn_id, message_id, index, final, delta }
//   delta = the newly completed lines of the streaming assistant message.
//           Deltas are non-overlapping; a code fence (```) can span deltas.
// stdout (JSON, exit 0): { hookSpecificOutput: { hookEventName: "MessageDisplay",
//                          displayContent: "..." } }
//   displayContent REPLACES the delta on screen. Display-only: the transcript
//   and the model's context keep the original English.
//
// Two layouts (state.json "mode"):
//   line     — every prose line gets its "↳ 译" immediately (buildDisplayContent)
//   section  — English passes through untouched; prose lines buffer in msgstate
//              and a grouped ZH block is spliced in when the section closes
//              (planSections + renderSections)
//
// Safety contract: on disabled / empty / error / timeout, emit NOTHING and
// exit 0 so Claude Code renders the original English delta unchanged. This hook
// must never break or stall the user's session.

const fs = require('fs');
const path = require('path');
const { getState, BASE, MSGSTATE_DIR, sweepMsgState } = require('../src/config');
const { buildDisplayContent, planSections, renderSections } = require('../src/interleave');

function showOriginal() { process.exit(0); } // no stdout => CC keeps the original delta

// Failures here are silent BY DESIGN (the screen just shows English), so the
// last one is preserved for `cctrans doctor` to surface. Fail-safe itself;
// atomic tmp+rename so concurrent erroring hooks can't tear the JSON.
function noteError(stage, e) {
  try {
    fs.mkdirSync(BASE, { recursive: true });
    const f = path.join(BASE, 'last-error.json');
    const tmp = f + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({
      ts: new Date().toISOString(), hook: 'message-display', stage: stage,
      error: String((e && e.stack) || e || '').slice(0, 2000),
    }));
    fs.renameSync(tmp, f);
  } catch (err) {}
}

// Per-message state, so "inside a ``` block?" and the open section's buffered
// lines carry across the deltas of one message (fresh process per delta).
// Reset at index 0 (also covers full repaints, which re-send the message from
// index 0); removed when the message completes. Schema {v, mode, index,
// inFence, buf}; a version/mode mismatch or unparseable file reads as fresh.
const STATE_V = 2;
function stateFile(id) { return path.join(MSGSTATE_DIR, String(id).replace(/[^\w.-]/g, '_') + '.json'); }
function loadMsgState(id, index, mode) {
  const fresh = { inFence: false, buf: [] };
  if (!id || index === 0) return fresh;
  try {
    const st = JSON.parse(fs.readFileSync(stateFile(id), 'utf8'));
    if (st.v !== STATE_V || st.mode !== mode) return fresh;
    // Index gap = an earlier delta crashed before saving. Drop the buffer so
    // two sections can never be translated as one block at a later boundary;
    // keep the fence flag best-effort (same exposure line mode has today).
    if (st.index !== index - 1) return { inFence: !!st.inFence, buf: [] };
    return { inFence: !!st.inFence, buf: Array.isArray(st.buf) ? st.buf : [] };
  } catch (e) { return fresh; }
}
function saveMsgState(id, index, mode, inFence, buf, final) {
  if (!id) return;
  try {
    if (final) { try { fs.unlinkSync(stateFile(id)); } catch (e) {} return; }
    fs.mkdirSync(MSGSTATE_DIR, { recursive: true });
    const f = stateFile(id);
    const tmp = f + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ v: STATE_V, mode, index, inFence, buf }));
    fs.renameSync(tmp, f); // atomic: buf files are big enough for torn writes to matter
    if (index === 0) sweepMsgState(24 * 60 * 60 * 1000); // GC files leaked by killed sessions
  } catch (e) {}
}

function emit(displayContent) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'MessageDisplay', displayContent: displayContent },
  }));
  process.exit(0);
}

let data = '';
process.stdin.on('data', (d) => (data += d));
process.stdin.on('end', async () => {
  if (process.env.CCTRANS_DEBUG_STDIN) {
    try { fs.appendFileSync(process.env.CCTRANS_DEBUG_STDIN, '\n===== delta =====\n' + data + '\n'); } catch (e) {}
  }
  let inp = {};
  try { inp = JSON.parse(data); } catch (e) { return showOriginal(); }

  const delta = typeof inp.delta === 'string' ? inp.delta : '';

  // Recursion guard: the claude-code backend spawns `claude -p` with
  // CCTRANS_DISABLE=1 so a child Claude process can never re-enter this hook.
  if (process.env.CCTRANS_DISABLE) return showOriginal();

  let st;
  try { st = getState(inp.cwd); } catch (e) { noteError('getState', e); return showOriginal(); }
  if (!st.enabled) return showOriginal();

  const id = inp.message_id;
  const index = typeof inp.index === 'number' ? inp.index : 0;
  const final = inp.final === true;

  if (st.mode === 'section' || st.mode === 'message') {
    const ms = loadMsgState(id, index, st.mode);
    // An empty delta still flushes when it is the final one and lines are buffered.
    if (!delta && !(final && ms.buf.length)) return showOriginal();
    const guard = setTimeout(() => { noteError('guard-timeout', st.mode + ' boundary translation exceeded 9s'); showOriginal(); }, 9000);
    try {
      const planned = planSections(delta, {
        inFence: ms.inFence, buf: ms.buf, target: st.target, final: final,
        granularity: st.mode === 'message' ? 'message' : 'section',
      });
      // Commit state BEFORE translating (flushed sections already pruned from
      // buf): a crash/timeout past this point can only drop a section's
      // translation, never replay it at a wrong position.
      saveMsgState(id, index, st.mode, planned.inFence, planned.buf, final);
      if (!planned.flushes.length) { clearTimeout(guard); return showOriginal(); }
      const displayContent = await renderSections(planned, {
        target: st.target, backend: st.backend, model: st.model, marker: st.marker,
        timeoutMs: 5500, // smaller than line mode's 8000 so the google fallback keeps ~3s under the 9s guard
      });
      clearTimeout(guard);
      if (displayContent == null) return showOriginal();
      emit(displayContent);
    } catch (e) {
      clearTimeout(guard);
      noteError(st.mode, e);
      return showOriginal();
    }
    return;
  }

  // line mode
  if (!delta) return showOriginal();
  const ms = loadMsgState(id, index, 'line');

  // Guard below Claude Code's 10s MessageDisplay timeout so we always exit clean.
  const guard = setTimeout(() => { noteError('guard-timeout', 'line translation exceeded 9s'); showOriginal(); }, 9000);
  try {
    const { displayContent, inFence } = await buildDisplayContent(delta, {
      target: st.target, backend: st.backend, model: st.model,
      marker: st.marker, timeoutMs: 8000, inFence: ms.inFence,
    });
    clearTimeout(guard);
    saveMsgState(id, index, 'line', inFence, [], final); // persist even when nothing was translated
    if (displayContent == null) return showOriginal();
    emit(displayContent);
  } catch (e) {
    clearTimeout(guard);
    noteError('line', e);
    return showOriginal();
  }
});
