'use strict';
// Message granularity (`cctrans mode message`): every text boundary is
// suppressed — blank lines, headings, code fences, target-language lines —
// and the whole reply's translation arrives as ONE grouped block at
// final:true. Size caps still bound the buffer. Offline via seeded cache.
const fs = require('fs');
const os = require('os');
const path = require('path');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cctrans-message-'));
process.env.CCTRANS_HOME = TMP;
delete process.env.CCTRANS_DISABLE;

const assert = require('assert');
const { planSections, renderSections } = require('../src/interleave');
const { cacheKey } = require('../src/translate');
const { CACHE_DIR } = require('../src/config');

const ZH = {
  'Overview': '概览',
  'First paragraph about caching.': '关于缓存的第一段。',
  'Second paragraph about retries.': '关于重试的第二段。',
  'item one': '项目一',
};
fs.mkdirSync(CACHE_DIR, { recursive: true });
for (const [en, zh] of Object.entries(ZH)) {
  fs.writeFileSync(path.join(CACHE_DIR, cacheKey(en, 'zh-Hans', 'google') + '.txt'), zh);
}
const OPTS = { target: 'zh-Hans', backend: 'google', timeoutMs: 2000 };

async function run() {
  const d0 = '## Overview\n\nFirst paragraph about caching.\n\n```bash\nnpm test\n```\n\n';
  const d1 = '- item one\n\nSecond paragraph about retries.';

  // Mid-message delta: heading, blank, paragraph, fence — NO flush in message mode.
  let p0 = planSections(d0, { inFence: false, buf: [], target: 'zh-Hans', final: false, granularity: 'message' });
  assert.strictEqual(p0.flushes.length, 0, 'no boundary may flush mid-message');
  assert.strictEqual(p0.buf.filter((e) => !e.blank).length, 2, 'heading + paragraph buffered (code passes through unbuffered)');
  assert.ok(p0.buf.some((e) => e.blank), 'original blank lines are recorded in the buffer (to mirror in the ZH block)');
  assert.strictEqual(await renderSections(p0, OPTS), null, 'mid-message delta renders untouched');

  // Final delta: everything flushes as ONE grouped block at the very end — a
  // single ↳, the rest aligned under it, and the original paragraph blank lines
  // preserved between the translated lines (the reported "blanks gone" fix).
  const p1 = planSections(d1, { inFence: p0.inFence, buf: p0.buf, target: 'zh-Hans', final: true, granularity: 'message' });
  assert.strictEqual(p1.flushes.length, 1, 'exactly one flush, at final');
  assert.strictEqual(p1.flushes[0].entries.filter((e) => !e.blank).length, 4, 'heading + para + list item + closing para');
  const dc = await renderSections(p1, OPTS);
  assert.strictEqual(dc,
    '- item one\n\nSecond paragraph about retries.\n\n' +
    '↳ 概览\n\n  关于缓存的第一段。\n\n  项目一\n\n  关于重试的第二段。',
    'one grouped block: single ↳, aligned continuation, original blanks preserved');

  // Same lines in section mode flush 3 times (heading, paragraph, list+para) —
  // proves granularity actually changes behavior.
  const s0 = planSections(d0, { inFence: false, buf: [], target: 'zh-Hans', final: false, granularity: 'section' });
  const s1 = planSections(d1, { inFence: s0.inFence, buf: s0.buf, target: 'zh-Hans', final: true, granularity: 'section' });
  assert.ok(s0.flushes.length + s1.flushes.length >= 3, 'section mode flushes per block');

  // The size cap still bounds the buffer in message mode (no unbounded growth).
  const big = [];
  for (let i = 1; i <= 6; i++) big.push('Filler sentence number ' + i + ' ' + 'word '.repeat(300));
  const pBig = planSections(big.join('\n') + '\n', { inFence: false, buf: [], target: 'zh-Hans', final: false, granularity: 'message' });
  assert.ok(pBig.flushes.length >= 1, 'cap must still flush oversized buffers in message mode');

  console.log('PASS: message mode — single grouped block at final, boundaries suppressed, caps still bound the buffer.');
}

run().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
