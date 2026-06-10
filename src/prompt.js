'use strict';
// Zero-dependency interactive prompts for the setup wizard: an arrow-key
// single-select menu and a plain text question. No npm deps — raw-mode stdin +
// ANSI escapes only. Both fall back gracefully when stdin is not a TTY (piped /
// CI / --yes): select() returns the initial value, question() returns the
// default. Inspired by the onboarding flows of tools like ccstatusline, but
// implemented from scratch to keep the package dependency-free.

const readline = require('node:readline/promises');

const C = {
  dim: (s) => '\x1b[2m' + s + '\x1b[0m',
  cyan: (s) => '\x1b[36m' + s + '\x1b[0m',
  green: (s) => '\x1b[32m' + s + '\x1b[0m',
  red: (s) => '\x1b[31m' + s + '\x1b[0m',
  bold: (s) => '\x1b[1m' + s + '\x1b[0m',
};

// Sentinels a select() can resolve to (besides an option value):
//   BACK  — the user pressed ← / Backspace to step backward
const BACK = Symbol('cctrans.prompt.BACK');

// Arrow-key single-select.
//   opts: { title?, footer?, options:[{label, hint?, value, sep?}], initialValue?, allowBack? }
//   - an option with sep:true is a non-selectable separator/heading row
//   - allowBack:true makes ← / Backspace resolve BACK (for wizard back-nav)
// Returns the chosen value (or BACK). ↑/↓ or k/j move (skipping separators),
// 1-9 jump, Enter confirms, Ctrl-C aborts (exit 130). Non-TTY -> resolves
// initialValue immediately (never BACK).
function select(opts) {
  const options = opts.options || [];
  const selectable = (i) => options[i] && !options[i].sep;
  let idx = options.findIndex((o) => !o.sep && o.value === opts.initialValue);
  if (idx < 0) idx = options.findIndex((o) => !o.sep);
  if (idx < 0) idx = 0;
  if (!process.stdin.isTTY || !options.length) {
    return Promise.resolve(options.length ? options[idx].value : undefined);
  }

  return new Promise((resolve) => {
    const out = process.stdout;
    const stdin = process.stdin;
    if (opts.title) out.write(opts.title + '\n');
    const rows = options.length + (opts.footer ? 1 : 0);
    out.write('\x1b[?25l'); // hide cursor

    const draw = (first) => {
      if (!first) out.write('\x1b[' + rows + 'A'); // up over the option block (+footer)
      for (let i = 0; i < options.length; i++) {
        const o = options[i];
        if (o.sep) { out.write('\r\x1b[2K' + (o.label || '') + '\n'); continue; }
        const sel = i === idx;
        const label = sel ? C.cyan('❯ ') + C.bold(o.label) : '  ' + o.label;
        const hint = o.hint ? '  ' + C.dim(o.hint) : '';
        out.write('\r\x1b[2K' + label + hint + '\n');
      }
      if (opts.footer) out.write('\r\x1b[2K' + C.dim(opts.footer) + '\n');
    };
    draw(true);

    const move = (dir) => { // dir +1/-1, skip separators, wrap
      const n = options.length;
      for (let step = 0; step < n; step++) {
        idx = (idx + dir + n) % n;
        if (selectable(idx)) break;
      }
    };
    const cleanup = () => {
      try { stdin.setRawMode(false); } catch (e) {}
      stdin.pause();
      stdin.removeListener('data', onData);
      out.write('\x1b[?25h'); // show cursor
    };
    // A single data event may carry several keystrokes (rapid input, paste, or
    // a test driver), so walk the buffer token by token rather than comparing
    // the whole string.
    const onData = (buf) => {
      const s = buf.toString();
      let i = 0, moved = false;
      while (i < s.length) {
        if (s.startsWith('\x1b[A', i)) { move(-1); i += 3; moved = true; }
        else if (s.startsWith('\x1b[B', i)) { move(1); i += 3; moved = true; }
        else if (s.startsWith('\x1b[C', i)) { if (moved) draw(); cleanup(); resolve(options[idx].value); return; } // → = confirm
        else if (s.startsWith('\x1b[D', i)) { if (opts.allowBack) { cleanup(); resolve(BACK); return; } i += 3; } // ← = back
        else if (s[i] === 'k') { move(-1); i += 1; moved = true; }
        else if (s[i] === 'j') { move(1); i += 1; moved = true; }
        else if (s[i] >= '1' && s[i] <= '9') { const t = +s[i] - 1; if (selectable(t)) { idx = t; moved = true; } i += 1; }
        else if (/[a-zA-Z]/.test(s[i])) { const o = options.find((o) => o.hotkey && o.hotkey === s[i].toLowerCase()); if (o) { cleanup(); resolve(o.value); return; } i += 1; }
        else if (s[i] === '\r' || s[i] === '\n') { if (moved) draw(); cleanup(); resolve(options[idx].value); return; }
        else if ((s[i] === '\x7f' || s[i] === '\b') && opts.allowBack) { cleanup(); resolve(BACK); return; } // Backspace = back
        else if (s[i] === '\x03') { cleanup(); out.write('\n'); process.exit(130); } // Ctrl-C
        else i += 1; // skip unknown bytes
      }
      if (moved) draw();
    };
    try { stdin.setRawMode(true); } catch (e) {}
    stdin.resume();
    stdin.on('data', onData);
  });
}

// Plain text question (for secrets / free text). Non-TTY -> returns def.
async function question(prompt, def) {
  if (!process.stdin.isTTY) return def || '';
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const a = (await rl.question(prompt + (def ? C.dim(' [' + def + '] ') : ' '))).trim();
    return a || def || '';
  } finally {
    rl.close();
  }
}

module.exports = { select, question, C, BACK };
