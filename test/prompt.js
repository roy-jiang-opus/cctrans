'use strict';
// The zero-dep prompt helpers must degrade safely when stdin is NOT a TTY
// (piped / CI / --yes): select() returns the initial value and question()
// returns the default, both without hanging on raw-mode input. (The live
// arrow-key UI is exercised via tmux during release smoke, not in unit tests.)
const assert = require('assert');
const { select, question } = require('../src/prompt');

// In `npm test` stdin is not a TTY, so these take the fallback path.
assert.strictEqual(process.stdin.isTTY, undefined, 'precondition: test stdin is not a TTY');

async function run() {
  const opts = [{ label: 'a', value: 'a' }, { label: 'b', value: 'b' }, { label: 'c', value: 'c' }];

  // Non-TTY select returns the initial value (or the first option if none given).
  assert.strictEqual(await select({ options: opts, initialValue: 'b' }), 'b', 'select returns initialValue');
  assert.strictEqual(await select({ options: opts }), 'a', 'select defaults to first option');
  assert.strictEqual(await select({ options: opts, initialValue: 'zzz' }), 'a', 'unknown initial -> first option');
  assert.strictEqual(await select({ options: [] }), undefined, 'empty options -> undefined');

  // Non-TTY question returns the default.
  assert.strictEqual(await question('Key?', 'fallback'), 'fallback', 'question returns default');
  assert.strictEqual(await question('Key?'), '', 'question with no default -> empty string');

  console.log('PASS: prompt helpers fall back to initial/default off-TTY without hanging.');
}

// A watchdog so a regression that blocks on raw-mode input fails loudly instead
// of hanging the whole suite.
const wd = setTimeout(() => { console.error('FAIL: prompt helpers hung off-TTY'); process.exit(1); }, 5000);
run().then(() => clearTimeout(wd)).catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
