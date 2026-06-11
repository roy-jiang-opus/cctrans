'use strict';
// The settings editor's value logic (field visibility + ←/→ cycling) and its
// off-TTY contract. The live alt-screen UI is exercised via tmux during release
// smoke; here we lock the parts that are pure functions.
const fs = require('fs');
const os = require('os');
const path = require('path');
process.env.CCTRANS_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'cctrans-settings-'));

const assert = require('assert');
const { runSettings, basicFields, advancedFields, cycle } = require('../src/settings');
const { defaults } = require('../src/config');

async function run() {
  // Off-TTY: returns null (the caller falls back), never hangs on raw input.
  assert.strictEqual(process.stdin.isTTY, undefined, 'precondition: not a TTY under npm test');
  assert.strictEqual(await runSettings({}), null, 'runSettings returns null off-TTY');

  // Conditional rows: the append/replace row only exists in line mode; the API
  // key row only when the backend needs a key.
  const d = Object.assign(defaults(), { mode: 'line', display: 'append', backend: 'google' });
  const keysOf = (fl) => fl.filter((f) => !f.sep).map((f) => f.key);
  assert.ok(keysOf(basicFields(d)).includes('display'), 'display row shown in line mode');
  d.mode = 'section';
  assert.ok(!keysOf(basicFields(d)).includes('display'), 'display row hidden in section mode');
  d.mode = 'line';
  assert.ok(!keysOf(basicFields(d)).includes('__key'), 'no API-key row for google (no key needed)');
  d.backend = 'openai';
  assert.ok(keysOf(basicFields(d)).includes('__key'), 'API-key row shown for a keyed backend');
  // always-present actions
  assert.ok(keysOf(basicFields(d)).includes('__advanced') && keysOf(basicFields(d)).includes('__save'));
  assert.ok(keysOf(advancedFields(d)).includes('gapWithin') && keysOf(advancedFields(d)).includes('__back'));

  // cycle(): enum wraps, bool toggles, int clamps to [min,max].
  const m = { mode: 'line' };
  const modeField = basicFields(Object.assign(defaults(), m)).find((f) => f.key === 'mode');
  cycle(m, modeField, 1); assert.strictEqual(m.mode, 'section', 'enum cycles forward');
  cycle(m, modeField, -1); assert.strictEqual(m.mode, 'line', 'enum cycles back');
  cycle(m, modeField, -1); assert.strictEqual(m.mode, 'message', 'enum wraps backward');

  const bf = { enabled: true };
  cycle(bf, { key: 'enabled', type: 'bool' }, 1); assert.strictEqual(bf.enabled, false, 'bool toggles');

  const gi = { gapBetween: 2 };
  const gapField = advancedFields(Object.assign(defaults(), gi)).find((f) => f.key === 'gapBetween');
  cycle(gi, gapField, 1); assert.strictEqual(gi.gapBetween, 2, 'int clamps at max (2)');
  cycle(gi, gapField, -1); cycle(gi, gapField, -1); cycle(gi, gapField, -1);
  assert.strictEqual(gi.gapBetween, 0, 'int clamps at min (0)');

  console.log('PASS: settings editor — conditional rows, enum/bool/int cycling, off-TTY returns null.');
}

const wd = setTimeout(() => { console.error('FAIL: settings test hung'); process.exit(1); }, 5000);
run().then(() => clearTimeout(wd)).catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
