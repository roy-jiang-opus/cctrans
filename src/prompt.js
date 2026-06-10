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
  bold: (s) => '\x1b[1m' + s + '\x1b[0m',
};

// Arrow-key single-select.
//   opts: { title?, options:[{label, hint?, value}], initialValue? }
// Returns the chosen value. ↑/↓ or k/j move, 1-9 jump, Enter confirms, Ctrl-C
// aborts the process (exit 130). Non-TTY -> resolves initialValue immediately.
function select(opts) {
  const options = opts.options || [];
  let idx = options.findIndex((o) => o.value === opts.initialValue);
  if (idx < 0) idx = 0;
  if (!process.stdin.isTTY || !options.length) {
    return Promise.resolve(options.length ? options[idx].value : undefined);
  }

  return new Promise((resolve) => {
    const out = process.stdout;
    const stdin = process.stdin;
    if (opts.title) out.write(opts.title + '\n');
    out.write('\x1b[?25l'); // hide cursor

    const draw = (first) => {
      if (!first) out.write('\x1b[' + options.length + 'A'); // up N lines
      for (let i = 0; i < options.length; i++) {
        const o = options[i];
        const sel = i === idx;
        const label = sel ? C.cyan('❯ ') + C.bold(o.label) : '  ' + o.label;
        const hint = o.hint ? '  ' + C.dim(o.hint) : '';
        out.write('\r\x1b[2K' + label + hint + '\n');
      }
    };
    draw(true);

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
      const n = options.length;
      let i = 0, moved = false;
      while (i < s.length) {
        if (s.startsWith('\x1b[A', i)) { idx = (idx - 1 + n) % n; i += 3; moved = true; }
        else if (s.startsWith('\x1b[B', i)) { idx = (idx + 1) % n; i += 3; moved = true; }
        else if (s[i] === 'k') { idx = (idx - 1 + n) % n; i += 1; moved = true; }
        else if (s[i] === 'j') { idx = (idx + 1) % n; i += 1; moved = true; }
        else if (s[i] >= '1' && s[i] <= '9') { const t = +s[i] - 1; if (t < n) { idx = t; moved = true; } i += 1; }
        else if (s[i] === '\r' || s[i] === '\n') { if (moved) draw(); cleanup(); resolve(options[idx].value); return; }
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

module.exports = { select, question, C };
