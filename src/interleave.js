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

// The translated line mirrors the English line's block structure:
//   heading "## T"  -> "## ↳ 译"   (same heading style)
//   quote   "> T"   -> "> ↳ 译"    (stays inside the quote)
//   list    "- T"   -> "  ↳ 译"    (same-width indent — a re-applied "- " would
//                                   render a second bullet)
//   plain   "T"     -> "↳ 译"
// demoteStructure drops the heading/quote prefix (plain "↳ 译"): in a grouped
// section block displaced from its English line, a re-applied "## "/"> " would
// render a REAL heading / fresh blockquote detached from what it translates.
function zhLineFor(p, zh, marker, demoteStructure) {
  if (p.block === 'list') return ' '.repeat(p.prefix.length) + marker + zh;
  if (demoteStructure && (p.block === 'heading' || p.block === 'quote')) return marker + zh;
  return p.prefix + marker + zh;
}

// How to place the Chinese line under the English line (line mode).
// hardBreak=true uses a CommonMark hard line break (two trailing spaces) so the
// two lines stay separate even if displayContent is markdown-rendered.
function pair(p, zh, marker, hardBreak) {
  const br = hardBreak ? '  \n' : '\n';
  return p.line + br + zhLineFor(p, zh, marker, false);
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

// ---------------------------------------------------------------------------
// Section mode: English streams untouched; a section's translation is spliced
// in as one grouped "↳" block when the section closes.
//
// A section = a maximal run of consecutive prose lines. Boundaries are
// properties of the TEXT, never of delta chunking (deltas batch arbitrarily —
// the same reply can arrive as 3 deltas in one run and 5 in another), which is
// what makes a full repaint (replay from index 0) reproduce identical output:
//   - a real blank line (the last split element '' merely encodes the delta's
//     trailing "\n" — a continuing block, not a blank);
//   - any code/fence/target-language line;
//   - a heading, which closes the run before it AND itself: a displaced
//     "## ↳ 译" would render as a real heading below the block it titles;
//   - the soft buffer cap (deferred past list items so a forced splice never
//     lands mid-list, with a hard ceiling as backstop);
//   - final:true.

const SECTION_CAP = 6000; // soft cap on buffered EN chars before a forced flush
const SECTION_HARD_CAP = 9000; // flush even mid-list past this

// Pure, synchronous segmentation — no I/O, no await, so the hook can persist
// the resulting buffer BEFORE translation starts (at-most-once flush: a crash
// or timeout after the save can only drop a section's translation, never
// replay it at a wrong position).
// opts: {inFence, buf (pending entries from prior deltas), target, final}
// Returns:
//   out      — the delta's own lines, verbatim (splice skeleton)
//   flushes  — [{pos, entries}]: closed sections and where in `out` their ZH
//              block goes (right after the section's last English line)
//   buf      — entries still pending (the open section), to persist
//   inFence  — fence state at end of delta, to persist
function planSections(rawDelta, opts) {
  opts = opts || {};
  const lines = String(rawDelta).split('\n');
  const { plan, inFence } = classify(lines, opts.inFence, opts.target || 'zh-Hans');
  const out = [];
  const flushes = [];
  let pending = (opts.buf || []).slice();
  let pendingChars = pending.reduce((n, e) => n + e.content.length, 0);
  const flush = () => {
    if (pending.length) { flushes.push({ pos: out.length, entries: pending }); pending = []; pendingChars = 0; }
  };
  for (let i = 0; i < plan.length; i++) {
    const p = plan[i];
    if (p.kind === 'prose') {
      if (p.block === 'heading') flush(); // close the run before the heading
      out.push(p.line);
      pending.push({ line: p.line, prefix: p.prefix, content: p.content, block: p.block });
      pendingChars += p.content.length;
      if (p.block === 'heading') flush(); // ...and the heading itself
      else if (pendingChars > SECTION_CAP && (p.block !== 'list' || pendingChars > SECTION_HARD_CAP)) flush();
      continue;
    }
    if (p.kind === 'blank') {
      const terminalArtifact = i === plan.length - 1 && p.line === '';
      if (!terminalArtifact) flush();
      out.push(p.line);
      continue;
    }
    flush(); // code/fence/target line interrupts the section, then passes through
    out.push(p.line);
  }
  if (opts.final) flush();
  return { out, flushes, buf: pending, inFence };
}

// Translate all flushed sections (one batch call) and splice each grouped ZH
// block into the out-skeleton. Returns the displayContent string, or null for
// "leave this delta as the original English" (nothing survived translation, or
// over the cap). Translation is per-LINE (prefix-stripped), so the sha1 cache
// is shared with line mode and the backends' line contracts hold unchanged.
async function renderSections(planned, opts) {
  opts = opts || {};
  const marker = opts.marker || '↳ ';
  const cap = opts.cap || 9000;
  if (!planned.flushes.length) return null;

  const contents = [];
  for (const f of planned.flushes) for (const e of f.entries) contents.push(e.content);
  const zh = await translateLines(contents, {
    target: opts.target, backend: opts.backend, model: opts.model, timeoutMs: opts.timeoutMs,
  });

  let k = 0;
  const blocks = [];
  for (const f of planned.flushes) {
    // Single-line sections keep line-mode structure; a uniform quote run keeps
    // its "> " (the block continues the same blockquote). Only mixed grouped
    // blocks demote structure prefixes.
    const grouped = f.entries.length > 1;
    const allQuote = grouped && f.entries.every((e) => e.block === 'quote');
    const blockLines = [];
    for (const e of f.entries) {
      const t = zh[k++];
      if (t && t.trim() && t.trim() !== e.content.trim()) blockLines.push(zhLineFor(e, t, marker, grouped && !allQuote));
    }
    if (blockLines.length) blocks.push({ pos: f.pos, lines: blockLines });
  }
  if (!blocks.length) return null;

  const splice = () => {
    const merged = planned.out.slice();
    for (let i = blocks.length - 1; i >= 0; i--) merged.splice(blocks[i].pos, 0, ...blocks[i].lines);
    return merged.join('\n');
  };
  let dc = splice();
  // Over the cap: shed whole ZH blocks (largest first) instead of dropping the
  // delta's entire translation — their sections are already committed out of
  // the buffer, so a shed block is simply lost, never repositioned.
  while (dc.length > cap && blocks.length) {
    let big = 0;
    for (let i = 1; i < blocks.length; i++) {
      if (blocks[i].lines.join('\n').length > blocks[big].lines.join('\n').length) big = i;
    }
    blocks.splice(big, 1);
    dc = blocks.length ? splice() : null;
  }
  return dc;
}

module.exports = { buildDisplayContent, classify, looksLikeCodeish, planSections, renderSections };
