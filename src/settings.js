'use strict';
// Single-screen interactive settings editor — `cctrans settings`, and the
// first-run config during `cctrans install`. Renders in the terminal's
// ALTERNATE screen buffer so it repaints in place and leaves NO scrollback
// history (unlike a stacked prompt sequence). Zero dependencies: raw-mode stdin
// + ANSI only.
//
// Keys: ↑/↓ (or k/j) move · ←/→ (or h/l) change the focused value · Enter edits
// text / opens Advanced / runs Save · q or Esc save & exit · Ctrl-C cancels.
//
// Basic settings are the everyday choices (also asked during install); Advanced
// holds the fine-grained knobs behind a single row. The editor works on a draft
// copy of the state and persists with setState() on save; API keys are written
// straight to keys.json.

const { getState, setState, MODES, DISPLAYS } = require('./config');
const { listLangs, getLang } = require('./langs');
const { listBackends, getBackend } = require('./backends');
const keys = require('./keys');

const C = {
  dim: (s) => '\x1b[2m' + s + '\x1b[0m',
  cyan: (s) => '\x1b[36m' + s + '\x1b[0m',
  green: (s) => '\x1b[32m' + s + '\x1b[0m',
  red: (s) => '\x1b[31m' + s + '\x1b[0m',
  bold: (s) => '\x1b[1m' + s + '\x1b[0m',
};
const VERSION = require('../package.json').version;

function parseKey(s) {
  if (s === '\x1b[A') return { t: 'up' };
  if (s === '\x1b[B') return { t: 'down' };
  if (s === '\x1b[C') return { t: 'right' };
  if (s === '\x1b[D') return { t: 'left' };
  if (s === '\r' || s === '\n') return { t: 'enter' };
  if (s === '\x1b') return { t: 'esc' };
  if (s === '\x03') return { t: 'ctrlc' };
  if (s === '\x7f' || s === '\b') return { t: 'backspace' };
  return { t: 'char', ch: s };
}

// Field descriptors. type: 'bool' | 'enum' | 'int' | 'text' | 'key' | 'action'.
// enum/int/bool change with ←/→; text/key edit with Enter; action runs on Enter.
function basicFields(d) {
  const b = getBackend(d.backend);
  const f = [
    { key: 'enabled', label: 'Translation', type: 'bool', fmt: () => (d.enabled ? C.green('on') : 'off') },
    { key: 'target', label: 'Language', type: 'enum', values: listLangs(), fmt: () => d.target + C.dim('  ' + (getLang(d.target) ? getLang(d.target).name : '?')) },
    { key: 'mode', label: 'Mode', type: 'enum', values: MODES, fmt: () => d.mode },
  ];
  if (d.mode === 'line') f.push({ key: 'display', label: 'Translated line', type: 'enum', values: DISPLAYS, fmt: () => d.display + C.dim(d.display === 'replace' ? '  (only the translation)' : '  (English + translation)') });
  f.push({ key: 'backend', label: 'Backend', type: 'enum', values: listBackends().map((x) => x.id), fmt: () => d.backend + (b && keys.KEY_IDS.includes(b.id) ? '  ' + (b.available() ? C.green('✓ key') : C.red('needs key')) : (b && b.available() ? C.green('  ✓') : '')) });
  if (b && keys.KEY_IDS.includes(b.id)) f.push({ key: '__key', label: 'API key', type: 'key', fmt: () => (b.available() ? C.green('✓ set') : C.dim('not set')) });
  f.push({ key: 'dialog', label: 'Question dialogs', type: 'bool', fmt: () => (d.dialog ? C.green('on') : 'off') });
  f.push({ key: 'inputEn', label: 'Input translation', type: 'bool', fmt: () => (d.inputEn ? C.green('on') + C.dim(' (beta)') : 'off' + C.dim(' (beta)')) });
  f.push({ sep: true });
  f.push({ key: '__advanced', label: '⚙ Advanced settings', type: 'action', fmt: () => C.dim('→') });
  f.push({ key: '__save', label: C.green('✓ Save & exit'), type: 'action', fmt: () => '' });
  return f;
}
function advancedFields(d) {
  return [
    { key: 'gapWithin', label: 'Gap: original → translation', type: 'int', min: 0, max: 1, fmt: () => d.gapWithin + C.dim(' blank line(s)') },
    { key: 'gapBetween', label: 'Gap: between translated lines', type: 'int', min: 0, max: 2, fmt: () => d.gapBetween + C.dim(' blank line(s)  (line mode)') },
    { key: 'marker', label: 'Marker', type: 'text', fmt: () => JSON.stringify(d.marker) },
    { key: 'model', label: 'OpenAI model', type: 'text', fmt: () => d.model },
    { key: 'anthropicModel', label: 'Anthropic model', type: 'text', fmt: () => d.anthropicModel },
    { key: 'azureEndpoint', label: 'Azure endpoint', type: 'text', fmt: () => C.dim(d.azureEndpoint) },
    { key: 'inputMinChars', label: 'Input trigger (non-Latin chars)', type: 'int', min: 1, max: 99, fmt: () => String(d.inputMinChars) },
    { key: 'cacheMaxMB', label: 'Cache cap (MB)', type: 'int', min: 10, max: 5000, step: 50, fmt: () => String(d.cacheMaxMB) },
    { sep: true },
    { key: '__back', label: '← Back to basic settings', type: 'action', fmt: () => '' },
  ];
}

function cycle(d, f, dir) {
  if (f.type === 'bool') { d[f.key] = !d[f.key]; return; }
  if (f.type === 'enum') {
    const i = f.values.indexOf(d[f.key]);
    d[f.key] = f.values[(i + dir + f.values.length) % f.values.length];
    return;
  }
  if (f.type === 'int') {
    const step = f.step || 1;
    let v = (typeof d[f.key] === 'number' ? d[f.key] : parseInt(d[f.key], 10) || f.min) + dir * step;
    v = Math.max(f.min, Math.min(f.max, v));
    d[f.key] = v;
  }
}

// Open the editor on a draft of the current state. Returns true if saved.
// Non-interactive (no TTY) returns null so the caller can fall back.
async function runSettings(opts) {
  opts = opts || {};
  if (!process.stdin.isTTY) return null;
  const out = process.stdout;
  const stdin = process.stdin;
  const d = Object.assign({}, getState(), opts.seed || {});

  // key stream: one persistent handler with a tiny queue so fast keystrokes
  // are never dropped between awaits.
  const q = []; let waiter = null;
  const onData = (buf) => { const s = buf.toString(); if (waiter) { const w = waiter; waiter = null; w(s); } else q.push(s); };
  const nextChunk = () => (q.length ? Promise.resolve(q.shift()) : new Promise((r) => { waiter = r; }));

  out.write('\x1b[?1049h\x1b[?25l'); // enter alt screen, hide cursor
  stdin.setRawMode(true); stdin.resume();
  stdin.on('data', onData);

  let page = 'basic';
  let idx = 0;
  let editing = null; // {key, label, buffer, isKey}
  let saved = false;

  const render = () => {
    const fields = page === 'basic' ? basicFields(d) : advancedFields(d);
    const lines = [];
    lines.push(C.bold('cctrans settings') + C.dim('  v' + VERSION + (page === 'advanced' ? '  ·  Advanced' : '')));
    lines.push('');
    const labelW = 30;
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      if (f.sep) { lines.push(''); continue; }
      const focused = i === idx;
      const cursor = focused ? C.cyan('❯ ') : '  ';
      let label = f.label;
      let value;
      if (editing && focused && (f.type === 'text' || f.type === 'key')) {
        value = (editing.buffer || '') + C.cyan('▏');
      } else {
        value = f.fmt ? f.fmt() : '';
      }
      const plainLabel = f.label.replace(/\x1b\[[0-9;]*m/g, '');
      const pad = ' '.repeat(Math.max(1, labelW - plainLabel.length));
      label = focused ? C.bold(f.label) : f.label;
      lines.push(cursor + label + pad + value);
    }
    lines.push('');
    const help = editing ? 'type to edit · Enter save · Esc cancel'
      : '↑/↓ move · ←/→ change · Enter edit/open · q save & quit · Ctrl-C cancel';
    lines.push(C.dim(help));
    out.write('\x1b[H' + lines.map((l) => l + '\x1b[K').join('\r\n') + '\x1b[J');
  };

  const fieldsNow = () => (page === 'basic' ? basicFields(d) : advancedFields(d));
  const moveSel = (dir) => {
    const fields = fieldsNow();
    for (let s = 0; s < fields.length; s++) {
      idx = (idx + dir + fields.length) % fields.length;
      if (!fields[idx].sep) break;
    }
  };

  try {
    render();
    const isValue = (f) => f.type === 'bool' || f.type === 'enum' || f.type === 'int';
    let brk = null; // 'save' | 'cancel'
    while (brk == null) {
      const chunk = await nextChunk();
      // A data chunk may batch several keys (fast input / paste / test driver),
      // so split it into tokens and process each.
      for (const k of splitKeys(chunk)) {
        const p = parseKey(k);
        if (editing) {
          if (p.t === 'enter') { commitEdit(d, editing); editing = null; }
          else if (p.t === 'esc' || p.t === 'ctrlc') editing = null;
          else if (p.t === 'backspace') editing.buffer = editing.buffer.slice(0, -1);
          else if (p.t === 'char' && k >= ' ') editing.buffer += k;
          continue;
        }
        const fields = fieldsNow();
        const f = fields[idx] || {};
        if (p.t === 'up' || (p.t === 'char' && p.ch === 'k')) moveSel(-1);
        else if (p.t === 'down' || (p.t === 'char' && p.ch === 'j')) moveSel(1);
        else if (p.t === 'left' || (p.t === 'char' && p.ch === 'h')) { if (isValue(f)) cycle(d, f, -1); }
        else if (p.t === 'right' || (p.t === 'char' && p.ch === 'l')) { if (isValue(f)) cycle(d, f, 1); }
        else if (p.t === 'enter') {
          if (f.key === '__save') { brk = 'save'; break; }
          else if (f.key === '__advanced') { page = 'advanced'; idx = 0; }
          else if (f.key === '__back') { page = 'basic'; idx = 0; }
          else if (f.type === 'text') editing = { key: f.key, buffer: String(d[f.key] || '') };
          else if (f.type === 'key') editing = { key: f.key, buffer: '', isKey: true };
          else if (isValue(f)) cycle(d, f, 1);
        }
        else if (p.t === 'char' && p.ch === 'q') { brk = 'save'; break; }
        else if (p.t === 'esc') { brk = 'save'; break; }
        else if (p.t === 'ctrlc') { brk = 'cancel'; break; }
      }
      render();
    }
    saved = brk === 'save';
  } finally {
    stdin.removeListener('data', onData);
    stdin.setRawMode(false); stdin.pause();
    out.write('\x1b[?25h\x1b[?1049l'); // show cursor, leave alt screen
  }

  if (!saved) { console.log(C.dim('cancelled — nothing changed')); return false; }
  setState({
    enabled: d.enabled, backend: d.backend, target: d.target, model: d.model,
    anthropicModel: d.anthropicModel, azureEndpoint: d.azureEndpoint, marker: d.marker,
    mode: d.mode, display: d.display, gapWithin: d.gapWithin, gapBetween: d.gapBetween,
    dialog: d.dialog, inputEn: d.inputEn, inputMinChars: d.inputMinChars, cacheMaxMB: d.cacheMaxMB,
  });
  return true;
}

function splitKeys(chunk) {
  // split a data chunk into individual key tokens (arrows are 3 bytes)
  const ks = [];
  let i = 0;
  while (i < chunk.length) {
    if (chunk.startsWith('\x1b[', i) && i + 2 < chunk.length + 1 && /[A-D]/.test(chunk[i + 2] || '')) { ks.push(chunk.slice(i, i + 3)); i += 3; }
    else { ks.push(chunk[i]); i += 1; }
  }
  return ks;
}

function commitEdit(d, editing) {
  const v = editing.buffer.trim();
  if (editing.isKey) {
    const b = getBackend(d.backend);
    if (b && v) keys.setKey(b.id, v);
  } else if (v) {
    d[editing.key] = v;
  }
}

module.exports = { runSettings, basicFields, advancedFields, cycle };
