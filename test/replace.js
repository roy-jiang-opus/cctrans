'use strict';
// Replace display mode (line mode): the translation is shown IN PLACE of the
// English line — no English, no ↳ marker — while the transcript/model context
// stay English (displayContent is display-only). Identity/failed lines keep the
// original (never blanked). Code/blank/already-target pass through. Offline.
const fs = require('fs');
const os = require('os');
const path = require('path');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cctrans-replace-'));
process.env.CCTRANS_HOME = TMP;
delete process.env.CCTRANS_DISABLE;

const assert = require('assert');
const { spawnSync } = require('child_process');
const { buildDisplayContent } = require('../src/interleave');
const { cacheKey } = require('../src/translate');
const { CACHE_DIR, MSGSTATE_DIR } = require('../src/config');

const ZH = {
  'Testing catches bugs early.': '测试能及早发现错误。',
  'Use these steps:': '使用以下步骤：',
  'Enable the cache': '启用缓存',
  'Restart afterwards.': '之后请重启。',
  'Overview': '概览',
  'Already done.': 'Already done.', // identity echo -> keep original
};
fs.mkdirSync(CACHE_DIR, { recursive: true });
for (const [en, zh] of Object.entries(ZH)) {
  fs.writeFileSync(path.join(CACHE_DIR, cacheKey(en, 'zh-Hans', 'google') + '.txt'), zh);
}
const OPTS = { target: 'zh-Hans', backend: 'google', timeoutMs: 2000, display: 'replace' };

async function run() {
  // Plain prose: replaced by the translation, no English, no marker.
  let r = await buildDisplayContent('Testing catches bugs early.\n', OPTS);
  assert.strictEqual(r.displayContent.split('\n')[0], '测试能及早发现错误。', 'prose replaced in place, no marker/EN');
  assert.ok(!/↳/.test(r.displayContent), 'replace mode has no ↳ marker');
  assert.ok(!/Testing catches/.test(r.displayContent), 'English dropped');

  // Append mode (default) still interleaves with the marker — proves orthogonality.
  const ap = await buildDisplayContent('Testing catches bugs early.\n', Object.assign({}, OPTS, { display: 'append' }));
  assert.ok(/Testing catches bugs early\./.test(ap.displayContent) && /↳ 测试能及早发现错误。/.test(ap.displayContent),
    'append mode keeps EN + ↳ ZH');

  // Block structure: replace keeps the REAL bullet/heading (it IS the line now).
  r = await buildDisplayContent('## Overview\n', OPTS);
  assert.strictEqual(r.displayContent.split('\n')[0], '## 概览', 'heading replaced keeps ## (no marker)');
  r = await buildDisplayContent('- Enable the cache\n', OPTS);
  assert.strictEqual(r.displayContent.split('\n')[0], '- 启用缓存', 'list item replaced keeps the real bullet');

  // Must-not-vanish: a line whose translation == source keeps the original line
  // verbatim (passthrough), never a blank.
  r = await buildDisplayContent('Already done.\n', OPTS);
  assert.strictEqual(r.displayContent.split('\n')[0], 'Already done.', 'identity line kept verbatim, never blanked');
  // ...and mixed with a translatable line, the identity line stays verbatim.
  r = await buildDisplayContent('Already done.\nTesting catches bugs early.\n', OPTS);
  const lines = r.displayContent.split('\n');
  assert.strictEqual(lines[0], 'Already done.', 'identity line kept verbatim, never blanked');
  assert.strictEqual(lines[1], '测试能及早发现错误。', 'translatable line replaced');

  // Code and blanks pass through unchanged in replace mode.
  r = await buildDisplayContent('Use these steps:\n\n```bash\nnpm test\n```\n', Object.assign({}, OPTS, { final: true }));
  assert.ok(/```bash\nnpm test\n```/.test(r.displayContent), 'code fence passes through verbatim');
  assert.ok(/使用以下步骤：/.test(r.displayContent), 'prose before code is replaced');

  // --- hook end-to-end: replace mode, transcript stays English ---
  fs.writeFileSync(path.join(TMP, 'state.json'),
    JSON.stringify({ enabled: true, backend: 'google', target: 'zh-Hans', mode: 'line', display: 'replace' }));
  const runHook = (payload) => {
    const res = spawnSync(process.execPath, [path.join(__dirname, '..', 'hook', 'message-display.js')], {
      input: JSON.stringify(payload), env: process.env, encoding: 'utf8', timeout: 15000,
    });
    assert.strictEqual(res.status, 0, 'hook exits 0; stderr: ' + res.stderr);
    return res.stdout ? JSON.parse(res.stdout).hookSpecificOutput.displayContent : null;
  };
  const dc = runHook({ message_id: 'rep1', index: 0, final: true, delta: 'Testing catches bugs early.\n' });
  assert.strictEqual(dc.split('\n')[0], '测试能及早发现错误。', 'hook replaces EN with ZH in replace mode');
  assert.ok(!/Testing catches/.test(dc) && !/↳/.test(dc), 'no English, no marker on screen');
  // The displayContent is display-only: the hook never writes the transcript, so
  // the model context stays English by construction (CC keeps the original delta
  // in the transcript; the hook only returns displayContent). Asserted by design.

  console.log('PASS: replace mode — ZH in place of EN (no marker), structure kept, identity/code/blank never blanked; orthogonal to append.');
}

run().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
