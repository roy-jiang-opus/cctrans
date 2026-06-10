'use strict';
// Claude Code PreToolUse + PostToolUse hook for AskUserQuestion: translate the
// interactive question dialog into the target language while the MODEL keeps
// reading English. Registered for BOTH events with matcher "AskUserQuestion";
// it dispatches on hook_event_name.
//
// PreToolUse stdin: { ..., tool_name, tool_input:{questions:[...]}, tool_use_id }
//   -> stdout { hookSpecificOutput:{ hookEventName:"PreToolUse", updatedInput } }
//      (NO permissionDecision — that would auto-run the tool with empty answers
//      and the dialog would never render). Stashes a restore map by tool_use_id.
// PostToolUse stdin: { ..., tool_name, tool_response:{questions,answers,...}, tool_use_id }
//   -> stdout { hookSpecificOutput:{ hookEventName:"PostToolUse", updatedToolOutput } }
//      with the selected answer restored to English.
//
// Safety: on disabled / not-AskUserQuestion / error / timeout, emit NOTHING and
// exit 0 — Claude Code then uses the original input/output unchanged. PreToolUse
// BLOCKS the dialog from rendering for the hook's runtime, so settings.json sets
// a short per-hook timeout and this guards translation well under it.

const fs = require('fs');
const path = require('path');
const { getState, BASE, DLGMAP_DIR, sweepDlgMap } = require('../src/config');
const { translateQuestions, restoreAnswer } = require('../src/dialog');

function passThrough() { process.exit(0); } // no stdout => CC keeps the original input/output

function noteError(stage, e) {
  try {
    fs.mkdirSync(BASE, { recursive: true });
    const f = path.join(BASE, 'last-error.json');
    const tmp = f + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({
      ts: new Date().toISOString(), hook: 'ask-user-question', stage: stage,
      error: String((e && e.stack) || e || '').slice(0, 2000),
    }));
    fs.renameSync(tmp, f);
  } catch (err) {}
}

function mapFile(id) { return path.join(DLGMAP_DIR, String(id).replace(/[^\w.-]/g, '_') + '.json'); }

let data = '';
process.stdin.on('data', (d) => (data += d));
process.stdin.on('end', async () => {
  if (process.env.CCTRANS_DEBUG_STDIN) {
    try { fs.appendFileSync(process.env.CCTRANS_DEBUG_STDIN, '\n===== dialog =====\n' + data + '\n'); } catch (e) {}
  }
  // Recursion guard: the claude-code backend spawns `claude -p` with CCTRANS_DISABLE=1.
  if (process.env.CCTRANS_DISABLE) return passThrough();

  let inp = {};
  try { inp = JSON.parse(data); } catch (e) { return passThrough(); }
  if (inp.tool_name !== 'AskUserQuestion') return passThrough();

  let st;
  try { st = getState(inp.cwd); } catch (e) { noteError('getState', e); return passThrough(); }
  if (!st.enabled || !st.dialog) return passThrough();

  const id = inp.tool_use_id;
  const event = inp.hook_event_name;

  if (event === 'PreToolUse') {
    const guard = setTimeout(() => { noteError('guard-timeout', 'dialog translation exceeded timeout'); passThrough(); }, 8000);
    try {
      const r = await translateQuestions(inp.tool_input || {}, {
        target: st.target, backend: st.backend, model: st.model,
        marker: st.marker, display: st.display, timeoutMs: 5000,
      });
      clearTimeout(guard);
      if (!r) return passThrough();
      if (id) {
        try {
          fs.mkdirSync(DLGMAP_DIR, { recursive: true });
          const f = mapFile(id);
          const tmp = f + '.' + process.pid + '.tmp';
          fs.writeFileSync(tmp, JSON.stringify(r.map));
          fs.renameSync(tmp, f);
          sweepDlgMap(24 * 60 * 60 * 1000); // GC maps left by abandoned dialogs
        } catch (e) {} // a missing map only means PostToolUse can't restore -> append mode stays EN-first
      }
      process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', updatedInput: r.updatedInput } }));
      process.exit(0);
    } catch (e) {
      clearTimeout(guard);
      noteError('PreToolUse', e);
      return passThrough();
    }
  }

  if (event === 'PostToolUse') {
    try {
      if (!id) return passThrough();
      let map;
      try { map = JSON.parse(fs.readFileSync(mapFile(id), 'utf8')); } catch (e) { return passThrough(); }
      const restored = restoreAnswer(inp.tool_response, map);
      try { fs.unlinkSync(mapFile(id)); } catch (e) {} // consumed
      if (!restored) return passThrough();
      process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', updatedToolOutput: restored } }));
      process.exit(0);
    } catch (e) {
      noteError('PostToolUse', e);
      return passThrough();
    }
  }

  return passThrough();
});
