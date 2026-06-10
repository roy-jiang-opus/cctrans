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

// Leading BLOCK markdown (heading / list marker / blockquote) must be split
// off before translation: fed to an MT backend it gets kept or mangled, and
// re-rendered mid-line after the ↳ marker it shows up as literal "##" / "-" /
// ">" (the translated line no longer starts with the prefix, so the renderer
// treats it as text). Translate the content only; re-apply structure when
// building the translated line.
function splitBlockPrefix(line) {
  let m = line.match(/^(\s{0,3}#{1,6}\s+)(.*)$/); // heading
  if (m) return { prefix: m[1], content: m[2], block: 'heading' };
  m = line.match(/^(\s*(?:[-*+]|\d{1,3}[.)])\s+)(.*)$/); // list item
  if (m) return { prefix: m[1], content: m[2], block: 'list' };
  m = line.match(/^(\s*(?:>\s*)+)(.*)$/); // blockquote (possibly nested)
  if (m) return { prefix: m[1], content: m[2], block: 'quote' };
  return { prefix: '', content: line, block: null };
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
    const { prefix, content, block } = splitBlockPrefix(line);
    if (looksLikeCodeish(content)) { plan.push({ line, kind: 'code' }); continue; } // e.g. "- /path/to/file"
    plan.push({ line, kind: 'prose', prefix, content, block });
  }
  return { plan, inFence };
}

// How to place the Chinese line under the English line.
// hardBreak=true uses a CommonMark hard line break (two trailing spaces) so the
// two lines stay separate even if displayContent is markdown-rendered.
// The translated line mirrors the English line's block structure:
//   heading "## T"  -> "## ↳ 译"   (same heading style)
//   quote   "> T"   -> "> ↳ 译"    (stays inside the quote)
//   list    "- T"   -> "  ↳ 译"    (same-width indent — a re-applied "- " would
//                                   render a second bullet)
//   plain   "T"     -> "↳ 译"
function pair(p, zh, marker, hardBreak) {
  const br = hardBreak ? '  \n' : '\n';
  const prefix = p.block === 'list' ? ' '.repeat(p.prefix.length) : p.prefix;
  return p.line + br + prefix + marker + zh;
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
    if (plan[i].kind === 'prose') { proseIdx.push(i); proseLines.push(plan[i].content); }
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
      if (t && t.trim() && t.trim() !== p.content.trim()) out.push(pair(p, t, marker, hardBreak));
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
