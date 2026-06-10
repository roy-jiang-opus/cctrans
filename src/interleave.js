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

// --- Markdown tables -------------------------------------------------------
const PIPE_SENTINEL = ''; // private-use placeholder for an escaped \| while splitting cells
// Strip a leading blockquote prefix ("> ", possibly nested) so the table
// predicates also recognize a table INSIDE a blockquote; returns {quote, body}.
function stripQuote(line) {
  const m = line.match(/^(\s*(?:>\s?)+)([\s\S]*)$/);
  return m ? { quote: m[1], body: m[2] } : { quote: '', body: line };
}
// A GFM table delimiter row: contains pipes and dashes, ONLY [-:| ] chars
// (e.g. "|---|:--:|"). This is what makes a run of pipe lines a real TABLE
// rather than incidental prose pipes. A leading blockquote prefix is ignored.
function isDelimiterRow(line) {
  const body = stripQuote(line).body;
  return /\|/.test(body) && /-/.test(body) && /^[\s|:\-]+$/.test(body);
}
// A candidate table row: non-blank and contains a pipe (blockquote prefix ok).
function isTableRow(line) {
  const body = stripQuote(line).body;
  return body.trim() !== '' && body.includes('|');
}
// Split a markdown table row into trimmed cell texts, dropping the empty outer
// cells produced by leading/trailing pipes. Escaped \| stays inside a cell.
function splitRow(body) {
  const cells = body.replace(/\\\|/g, PIPE_SENTINEL).split('|')
    .map((c) => c.split(PIPE_SENTINEL).join('\\|').trim());
  if (cells.length && cells[0] === '') cells.shift();
  if (cells.length && cells[cells.length - 1] === '') cells.pop();
  return cells;
}
// Build a TRANSLATED COPY of a captured markdown table (array of raw lines) to
// append after the original: translate every non-delimiter cell (batched +
// cached), regenerate the |---| row, return the translated table's lines — or
// null if nothing translatable / all identity. The original table always
// passes through untouched, so any glitch here can only affect the appended
// copy, never the source table the TUI renders.
async function translateTable(rawLines, opts) {
  const rows = rawLines.map((l) => {
    const { quote, body } = stripQuote(l);
    return { quote, delim: isDelimiterRow(body), cells: splitRow(body) };
  });
  const toTranslate = [];
  const map = []; // [rowIdx, cellIdx] per entry
  for (let r = 0; r < rows.length; r++) {
    if (rows[r].delim) continue;
    rows[r].cells.forEach((c, ci) => {
      if (c && !looksLikeCodeish(c) && !isProbablyTarget(c, opts.target)) { toTranslate.push(c); map.push([r, ci]); }
    });
  }
  if (!toTranslate.length) return null;
  const zh = await translateLines(toTranslate, {
    target: opts.target, backend: opts.backend, model: opts.model, timeoutMs: opts.timeoutMs,
  });
  let any = false;
  for (let k = 0; k < map.length; k++) {
    const [r, ci] = map[k];
    const t = zh[k];
    if (t && t.trim() && t.trim() !== rows[r].cells[ci].trim()) { rows[r].cells[ci] = t.trim(); any = true; }
  }
  if (!any) return null;
  const ncol = Math.max(1, ...rows.map((row) => row.cells.length));
  return rows.map((row) => {
    if (row.delim) return row.quote + '| ' + Array(ncol).fill('---').join(' | ') + ' |';
    const cells = row.cells.slice();
    while (cells.length < ncol) cells.push('');
    return row.quote + '| ' + cells.join(' | ') + ' |';
  });
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
// inFence and returns the ending inFence alongside the plan. The same threading
// applies to "are we inside a markdown table?" (inTable): a table's header and
// |---| delimiter batch in one delta (probe-verified) but its data rows arrive
// in later deltas. Table lines are tagged kind:'table' so they pass through as
// a UNIT — translating a row, or splicing a ZH line between the header and the
// delimiter, breaks CommonMark table parsing (the table-splitting bug).
function classify(lines, inFenceInit, target, inTableInit) {
  const plan = [];
  let inFence = !!inFenceInit;
  let inTable = !!inTableInit;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isFence = /^\s*[`~]{3}/.test(line);
    if (isFence) { plan.push({ line, kind: 'code' }); inFence = !inFence; inTable = false; continue; }
    if (inFence) { plan.push({ line, kind: 'code' }); continue; }
    if (inTable) {
      if (isTableRow(line)) { plan.push({ line, kind: 'table' }); continue; }
      // The delta's trailing-\n artifact (a final empty element from split) is
      // NOT a real blank line, so it must not close a table spanning deltas.
      const terminalArtifact = i === lines.length - 1 && line === '';
      if (!terminalArtifact) inTable = false; // a real non-row line ends the table
    } else if (isTableRow(line) && isDelimiterRow(lines[i + 1] || '')) {
      plan.push({ line, kind: 'table' }); // header row; the delimiter + data rows follow
      inTable = true;
      continue;
    }
    if (line.trim() === '') { plan.push({ line, kind: 'blank' }); continue; }
    if (isProbablyTarget(line, target)) { plan.push({ line, kind: 'target' }); continue; }
    if (looksLikeCodeish(line)) { plan.push({ line, kind: 'code' }); continue; }
    const { prefix, content, block } = splitBlockPrefix(line);
    if (looksLikeCodeish(content)) { plan.push({ line, kind: 'code' }); continue; } // e.g. "- /path/to/file"
    plan.push({ line, kind: 'prose', prefix, content, block });
  }
  return { plan, inFence, inTable };
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

// How to place the Chinese line under the English line (line mode, append).
// hardBreak=true uses a CommonMark hard line break (two trailing spaces) so the
// two lines stay separate even if displayContent is markdown-rendered.
function pair(p, zh, marker, hardBreak) {
  const br = hardBreak ? '  \n' : '\n';
  return p.line + br + zhLineFor(p, zh, marker, false);
}

// Replace mode (line mode only): the translation shown IN PLACE of the English,
// keeping the line's own block structure (the real bullet/heading/quote, NOT
// the indent-without-marker form, since there is no English line above it) and
// no ↳ marker — it reads as a native target-language line.
function replaceLine(p, zh) {
  return p.prefix + zh;
}

// Returns { displayContent, inFence, inTable, tableBuf }:
//   displayContent — the interleaved EN/ZH string, or null to signal "leave this
//     delta as the original English" (nothing to translate, or over the cap).
//   inFence  — the code-fence state at the end of this delta, to thread on.
//   inTable  — the in-a-table state at the end of this delta, to thread on.
//   tableBuf — raw lines of an OPEN (not-yet-closed) table, carried to the next
//     delta; when the table closes (or opts.final) its translated copy is
//     appended after it. The original table always passes through untouched.
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
  const { plan, inFence, inTable } = classify(lines, opts.inFence, target, opts.inTable);

  const out = [];
  const prose = [];        // {pos, p}
  const tableFlushes = []; // {pos, lines} — a closed table to translate + insert
  let tableBuf = (opts.tableBuf || []).slice();
  for (let i = 0; i < plan.length; i++) {
    const p = plan[i];
    if (p.kind === 'table') { tableBuf.push(p.line); out.push(p.line); continue; }
    // A table closes on a real non-table line, NOT on the trailing-\n artifact
    // (which keeps the table open across the delta boundary).
    const terminalArtifact = i === plan.length - 1 && p.line === '';
    if (tableBuf.length && !terminalArtifact) { tableFlushes.push({ pos: out.length, lines: tableBuf }); tableBuf = []; }
    if (p.kind === 'prose') { prose.push({ pos: out.length, p }); out.push(p.line); }
    else out.push(p.line);
  }
  if (opts.final && tableBuf.length) { tableFlushes.push({ pos: out.length, lines: tableBuf }); tableBuf = []; }

  if (!prose.length && !tableFlushes.length) return { displayContent: null, inFence, inTable, tableBuf };

  const replace = opts.display === 'replace';
  if (prose.length) {
    const zh = await translateLines(prose.map((x) => x.p.content), {
      target, backend: opts.backend, model: opts.model, timeoutMs: opts.timeoutMs,
    });
    for (let j = 0; j < prose.length; j++) {
      const t = zh[j]; const p = prose[j].p;
      // Identity/empty/failed -> keep the original line (never blank it out).
      if (t && t.trim() && t.trim() !== p.content.trim()) {
        out[prose[j].pos] = replace ? replaceLine(p, t.trim()) : pair(p, t, marker, hardBreak);
      }
    }
  }
  if (tableFlushes.length) {
    const rendered = [];
    for (const tf of tableFlushes) {
      const tlines = await translateTable(tf.lines, { target, backend: opts.backend, model: opts.model, timeoutMs: opts.timeoutMs });
      rendered.push({ pos: tf.pos, lines: tlines });
    }
    for (let k = rendered.length - 1; k >= 0; k--) {
      if (rendered[k].lines && rendered[k].lines.length) out.splice(rendered[k].pos, 0, '', ...rendered[k].lines);
    }
  }
  const dc = out.join('\n');
  // Never emit "" — it SUPPRESSES the delta (zero rows) on screen; null leaves
  // the original. dc is "" only when an empty final delta flushed a table whose
  // translation was all-identity (the splice was skipped).
  if (!dc || dc.length > cap) return { displayContent: null, inFence, inTable, tableBuf };
  return { displayContent: dc, inFence, inTable, tableBuf };
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
// opts: {inFence, buf (pending entries from prior deltas), target, final,
//        granularity: 'section' (default) | 'message'}
// 'message' suppresses every text boundary except the size caps: the whole
// reply's translation arrives as one grouped block at final:true. Code/target
// lines still pass through untranslated — they just don't close the buffer.
// Returns:
//   out      — the delta's own lines, verbatim (splice skeleton)
//   flushes  — [{pos, entries}]: closed sections and where in `out` their ZH
//              block goes (right after the section's last English line)
//   buf      — entries still pending (the open section), to persist
//   inFence  — fence state at end of delta, to persist
function planSections(rawDelta, opts) {
  opts = opts || {};
  const wholeMessage = opts.granularity === 'message';
  const lines = String(rawDelta).split('\n');
  const { plan, inFence, inTable } = classify(lines, opts.inFence, opts.target || 'zh-Hans', opts.inTable);
  const out = [];
  const flushes = [];        // prose-section flushes
  const tableFlushes = [];   // {pos, lines} translated-table inserts
  let pending = (opts.buf || []).slice();
  let pendingChars = pending.reduce((n, e) => n + e.content.length, 0);
  let tableBuf = (opts.tableBuf || []).slice();
  const flush = () => {
    if (pending.length) { flushes.push({ pos: out.length, entries: pending }); pending = []; pendingChars = 0; }
  };
  const flushTable = () => {
    if (tableBuf.length) { tableFlushes.push({ pos: out.length, lines: tableBuf }); tableBuf = []; }
  };
  for (let i = 0; i < plan.length; i++) {
    const p = plan[i];
    const terminalArtifact = i === plan.length - 1 && p.line === '';
    if (p.kind === 'table') {
      if (!wholeMessage) flush(); // a table interrupts an open prose section
      tableBuf.push(p.line);
      out.push(p.line);
      continue;
    }
    // A real non-table line closes any open table (append its copy here); the
    // trailing-\n artifact does not (the table continues into the next delta).
    if (!terminalArtifact) flushTable();
    if (p.kind === 'prose') {
      if (p.block === 'heading' && !wholeMessage) flush(); // close the run before the heading
      out.push(p.line);
      pending.push({ line: p.line, prefix: p.prefix, content: p.content, block: p.block });
      pendingChars += p.content.length;
      if (p.block === 'heading' && !wholeMessage) flush(); // ...and the heading itself
      else if (pendingChars > SECTION_CAP && (p.block !== 'list' || pendingChars > SECTION_HARD_CAP)) flush();
      continue;
    }
    if (p.kind === 'blank') {
      if (!terminalArtifact && !wholeMessage) flush();
      out.push(p.line);
      continue;
    }
    if (!wholeMessage) flush(); // code/fence/target line interrupts the section
    out.push(p.line);
  }
  if (opts.final) { flush(); flushTable(); }
  return { out, flushes, tableFlushes, buf: pending, inFence, inTable, tableBuf };
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
  const tableFlushes = planned.tableFlushes || [];
  if (!planned.flushes.length && !tableFlushes.length) return null;

  const contents = [];
  for (const f of planned.flushes) for (const e of f.entries) contents.push(e.content);
  const zh = contents.length
    ? await translateLines(contents, { target: opts.target, backend: opts.backend, model: opts.model, timeoutMs: opts.timeoutMs })
    : [];

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
  // Translated-table copies, appended after their source table (separated by a
  // blank line so CommonMark parses them as a new table).
  for (const tf of tableFlushes) {
    const tlines = await translateTable(tf.lines, { target: opts.target, backend: opts.backend, model: opts.model, timeoutMs: opts.timeoutMs });
    if (tlines && tlines.length) blocks.push({ pos: tf.pos, lines: ['', ...tlines] });
  }
  if (!blocks.length) return null;
  blocks.sort((a, b) => a.pos - b.pos); // splice descending below needs ascending order

  const splice = () => {
    const merged = planned.out.slice();
    for (let i = blocks.length - 1; i >= 0; i--) merged.splice(blocks[i].pos, 0, ...blocks[i].lines);
    return merged.join('\n');
  };
  let dc = splice();
  // Over the cap: shed whole ZH blocks (largest first) instead of dropping the
  // delta's entire translation — their sections are already committed out of
  // the buffer, so a shed block is simply lost, never repositioned. Guard the
  // dc!=null check first: when the LAST block is shed dc becomes null, and
  // null.length would throw (then the whole delta reverts to English).
  while (dc != null && dc.length > cap && blocks.length) {
    let big = 0;
    for (let i = 1; i < blocks.length; i++) {
      if (blocks[i].lines.join('\n').length > blocks[big].lines.join('\n').length) big = i;
    }
    blocks.splice(big, 1);
    dc = blocks.length ? splice() : null;
  }
  return dc;
}

module.exports = { buildDisplayContent, classify, looksLikeCodeish, planSections, renderSections, isDelimiterRow, isTableRow, translateTable };
