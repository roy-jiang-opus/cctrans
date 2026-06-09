'use strict';
// Turn a chunk of assistant text (a MessageDisplay "delta") into interleaved
// EN/ZH displayContent. Prose lines get a Chinese line; code fences, bare
// paths/URLs, already-Chinese lines, and blanks pass through untouched.

const { translateLines } = require('./translate');
const { isProbablyTarget } = require('./langs');

function looksLikeCodeish(s) {
  const t = s.trim();
  if (!t) return false;
  if (/^[`~]{3}/.test(t)) return true; // fence line
  if (/^https?:\/\/\S+$/.test(t)) return true; // bare url
  if (/^[/~][\w./-]+$/.test(t)) return true; // bare path
  if ((t.match(/[A-Za-z]/g) || []).length === 0) return true; // pure symbols/numbers
  return false;
}

// A code fence (```), and therefore "are we inside a code block?", can span
// multiple MessageDisplay deltas. The caller threads the ending fence state of
// one delta into the next (keyed by message_id), so classify takes an initial
// inFence and returns the ending inFence alongside the plan.
function classify(lines, inFenceInit, target) {
  const plan = [];
  let inFence = !!inFenceInit;
  for (const line of lines) {
    const isFence = /^\s*[`~]{3}/.test(line);
    if (isFence) { plan.push({ line, kind: 'code' }); inFence = !inFence; continue; }
    if (inFence) { plan.push({ line, kind: 'code' }); continue; }
    if (line.trim() === '') { plan.push({ line, kind: 'blank' }); continue; }
    if (isProbablyTarget(line, target)) { plan.push({ line, kind: 'target' }); continue; }
    if (looksLikeCodeish(line)) { plan.push({ line, kind: 'code' }); continue; }
    plan.push({ line, kind: 'prose' });
  }
  return { plan, inFence };
}

// How to place the Chinese line under the English line.
// hardBreak=true uses a CommonMark hard line break (two trailing spaces) so the
// two lines stay separate even if displayContent is markdown-rendered.
function pair(enLine, zhLine, marker, hardBreak) {
  const br = hardBreak ? '  \n' : '\n';
  return enLine + br + marker + zhLine;
}

// Returns { displayContent, inFence }:
//   displayContent — the interleaved EN/ZH string, or null to signal "leave this
//     delta as the original English" (nothing to translate, or over the cap).
//   inFence — the code-fence state at the end of this delta, to thread into the
//     next delta of the same message.
async function buildDisplayContent(rawDelta, opts) {
  opts = opts || {};
  const marker = opts.marker || '↳ ';
  // Smoke-tested on CC 2.1.169: plain "\n" in displayContent renders EN and ZH
  // on separate lines. Hard break (two trailing spaces) only if a future
  // renderer soft-wraps adjacent lines together.
  const hardBreak = opts.hardBreak === true;
  const cap = opts.cap || 9000;

  const target = opts.target || 'zh-Hans';
  const lines = String(rawDelta).split('\n');
  const { plan, inFence } = classify(lines, opts.inFence, target);

  const proseIdx = [];
  const proseLines = [];
  for (let i = 0; i < plan.length; i++) {
    if (plan[i].kind === 'prose') { proseIdx.push(i); proseLines.push(plan[i].line); }
  }
  if (proseLines.length === 0) return { displayContent: null, inFence }; // nothing to translate

  const zh = await translateLines(proseLines, {
    target, backend: opts.backend, model: opts.model, timeoutMs: opts.timeoutMs,
  });
  const zhFor = {};
  for (let j = 0; j < proseIdx.length; j++) zhFor[proseIdx[j]] = zh[j];

  const out = [];
  for (let i = 0; i < plan.length; i++) {
    const p = plan[i];
    if (p.kind === 'prose') {
      const t = zhFor[i];
      if (t && t.trim() && t.trim() !== p.line.trim()) out.push(pair(p.line, t, marker, hardBreak));
      else out.push(p.line);
    } else {
      out.push(p.line);
    }
  }
  const dc = out.join('\n');
  if (dc.length > cap) return { displayContent: null, inFence };
  return { displayContent: dc, inFence };
}

module.exports = { buildDisplayContent, classify, looksLikeCodeish };
