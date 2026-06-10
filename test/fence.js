'use strict';
// Verifies code-fence state threads across deltas, so a code line is never
// translated even when its ``` fence arrived in an earlier delta (the run2 bug).
//
// Deterministic: CCTRANS_HOME points at a temp dir and every prose line is
// pre-seeded into the sha1 cache, so translateLines never touches the network.

const fs = require('fs');
const os = require('os');
const path = require('path');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cctrans-fence-'));
process.env.CCTRANS_HOME = TMP;

const assert = require('assert');
const { buildDisplayContent } = require('../src/interleave');
const { cacheKey } = require('../src/translate');
const { CACHE_DIR } = require('../src/config');

// Seeded values must DIFFER from the source line — an identical "translation"
// is treated as a backend echo and the translated line is suppressed.
const ZH = {
  'This explains the command.': '这是对该命令的解释。',
};
fs.mkdirSync(CACHE_DIR, { recursive: true });
for (const [en, zh] of Object.entries(ZH)) {
  fs.writeFileSync(path.join(CACHE_DIR, cacheKey(en, 'zh-Hans', 'google') + '.txt'), zh);
}

async function run() {
  // Simulate one message streamed as fence-split deltas, threading inFence.
  const deltas = [
    '```bash\n',           // index 0: opens fence
    'git rebase main\n',   // index 1: code line, fence opened in a PRIOR delta
    '```\n',               // index 2: closes fence
    '',                    // index 3: blank
  ];
  let inFence = false;
  const results = [];
  for (let i = 0; i < deltas.length; i++) {
    const r = await buildDisplayContent(deltas[i], { backend: 'google', inFence: (i === 0 ? false : inFence) });
    inFence = r.inFence;
    results.push(r);
  }

  // index 0: just the opening fence -> nothing translated, fence now open
  assert.strictEqual(results[0].displayContent, null, 'opening fence delta should not translate');
  assert.strictEqual(results[0].inFence, true, 'fence should be open after ```bash');

  // index 1: the code line -> MUST pass through untranslated (this was the bug)
  assert.strictEqual(results[1].displayContent, null, 'code line in a carried-over fence must not be translated');
  assert.strictEqual(results[1].inFence, true, 'still inside fence');

  // index 2: closing fence -> fence closes
  assert.strictEqual(results[2].inFence, false, 'fence should close after ```');

  // Single-delta block (the run3 case) must also stay code.
  const whole = await buildDisplayContent('```bash\ngit rebase main\n```\n\n', { backend: 'google', inFence: false });
  assert.strictEqual(whole.displayContent, null, 'self-contained code block must not translate');
  assert.strictEqual(whole.inFence, false, 'balanced fences end closed');

  // A prose delta arriving with the fence already closed should still translate.
  const prose = await buildDisplayContent('This explains the command.\n', { backend: 'google', inFence: false });
  assert.ok(prose.displayContent && prose.displayContent.includes('↳'), 'prose should be translated');
  assert.strictEqual(prose.displayContent, 'This explains the command.\n↳ 这是对该命令的解释。\n');

  console.log('PASS: fence state threads across deltas; code never translated; prose still translated.');
}

run().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
