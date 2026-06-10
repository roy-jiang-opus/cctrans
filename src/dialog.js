'use strict';
// AskUserQuestion dialog translation (used by hook/ask-user-question.js).
//
// The dialog is rendered by Claude Code's TUI from the tool's INPUT, so the
// MessageDisplay overlay never sees it. Instead a PreToolUse hook rewrites the
// tool input (question / option labels / descriptions / header) into the target
// language via `updatedInput`, and a PostToolUse hook restores the user's
// selected answer back to ENGLISH via `updatedToolOutput` — so the user reads
// the dialog in their language while the MODEL reads clean English (the answer
// is templated into model-visible context from the selected option LABEL and
// the question text). Both verified live on CC 2.1.170/2.1.172.
//
// Design notes (all probe-verified):
//   - PreToolUse must NOT set permissionDecision (that auto-runs the tool
//     headlessly with empty answers; the dialog never renders). updatedInput
//     alone re-renders the interactive dialog with the rewritten text.
//   - The answer the model reads is the selected option LABEL, so labels MUST
//     be restored to English (append mode keeps EN first as a safety net even
//     if restore is skipped; replace mode shows pure target and relies on the
//     restore). Descriptions never reach the model's result, so they need no
//     exact restore.
//   - updatedToolOutput is validated against the tool's output schema; a
//     malformed value is ignored by CC (fail-safe to the original output).

const { translateLines } = require('./translate');

// Translate a dialog's questions. Returns { updatedInput, map } or null when
// there is nothing translatable (leave the dialog English).
// opts: {target, backend, model, marker, display:'append'|'replace', timeoutMs}
async function translateQuestions(toolInput, opts) {
  opts = opts || {};
  const questions = Array.isArray(toolInput && toolInput.questions) ? toolInput.questions : [];
  if (!questions.length) return null;
  const marker = opts.marker || '↳ ';
  const replace = opts.display === 'replace';

  // One batched translateLines call for every field (shares the sha1 cache).
  const srcs = [];
  const pos = new Map();
  const want = (s) => { if (typeof s === 'string' && s && !pos.has(s)) { pos.set(s, srcs.length); srcs.push(s); } };
  for (const q of questions) {
    want(q.question); want(q.header);
    for (const o of (q.options || [])) { want(o.label); want(o.description); }
  }
  if (!srcs.length) return null;
  const zh = await translateLines(srcs, {
    target: opts.target, backend: opts.backend, model: opts.model, timeoutMs: opts.timeoutMs,
  });
  // translated text for a source, or null if identity/empty/failed
  const tr = (s) => {
    if (typeof s !== 'string' || !s) return null;
    const i = pos.get(s); const t = i != null ? zh[i] : null;
    return (t && t.trim() && t.trim() !== s.trim()) ? t.trim() : null;
  };
  // displayed form of a field: bilingual "EN\n↳ ZH" (append) or pure target (replace)
  const show = (en, t) => (!t ? en : (replace ? t : (en + '\n' + marker + t)));

  const map2en = {};
  const q2en = {};
  let changed = false;
  const newQuestions = questions.map((q) => {
    const dq = show(q.question, tr(q.question));
    if (dq !== q.question) { q2en[dq] = q.question; changed = true; }
    // Header is a short chip (max ~12 cols) and never appears in the model's
    // answer, so show it pure-target (no bilingual, no restore needed).
    const newHeader = tr(q.header) || q.header;
    const newOptions = (q.options || []).map((o) => {
      const dl = show(o.label, tr(o.label));
      if (dl !== o.label) changed = true;
      map2en[dl] = o.label;       // displayed label -> EN (what the user selects)
      map2en[o.label] = o.label;  // EN -> EN (idempotent)
      const lt = tr(o.label);
      if (lt) map2en[lt] = o.label; // pure-target form -> EN (belt + suspenders)
      const dd = o.description ? show(o.description, tr(o.description)) : o.description;
      return Object.assign({}, o, { label: dl, description: dd });
    });
    return Object.assign({}, q, { question: dq, header: newHeader, options: newOptions });
  });
  if (!changed) return null; // only header/description changed or nothing did -> leave English
  return {
    updatedInput: Object.assign({}, toolInput, { questions: newQuestions }),
    map: { map2en, q2en, marker },
  };
}

// Restore a tool_response so the MODEL reads English: answers keys (question
// text) and values (selected label) mapped back to English, and the nested
// questions[] echo cleaned up. Returns the rewritten object, or null when there
// is nothing to do. Free-text answers (not in the map) pass through verbatim.
function restoreAnswer(toolResponse, map) {
  if (!toolResponse || typeof toolResponse !== 'object' || !map) return null;
  const map2en = map.map2en || {};
  const q2en = map.q2en || {};
  const marker = map.marker || '↳ ';
  const out = JSON.parse(JSON.stringify(toolResponse));

  if (out.answers && typeof out.answers === 'object') {
    const na = {};
    for (const k of Object.keys(out.answers)) {
      const enKey = q2en[k] || k;
      // multi-select answers are joined with ", "
      const parts = String(out.answers[k]).split(', ').map((p) => map2en[p] || map2en[p.trim()] || p);
      na[enKey] = parts.join(', ');
    }
    out.answers = na;
  }
  if (Array.isArray(out.questions)) {
    out.questions = out.questions.map((q) => {
      const nq = Object.assign({}, q);
      if (typeof nq.question === 'string') nq.question = q2en[nq.question] || nq.question;
      if (Array.isArray(nq.options)) {
        nq.options = nq.options.map((o) => {
          const no = Object.assign({}, o);
          if (typeof no.label === 'string') no.label = map2en[no.label] || no.label;
          // strip a bilingual description tail back to EN (best-effort; pure
          // target descriptions can't be recovered but never reach the model)
          if (typeof no.description === 'string') no.description = no.description.split('\n' + marker)[0];
          return no;
        });
      }
      return nq;
    });
  }
  return out;
}

module.exports = { translateQuestions, restoreAnswer };
