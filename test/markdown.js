'use strict';
// Verifies block markdown (headings, list items, blockquotes) is stripped
// before translation and re-applied to the translated line — so the renderer
// never shows a literal "##" / "-" / ">" after the ↳ marker.
//
// Deterministic: CCTRANS_HOME points at a temp dir and every prose line is
// pre-seeded into the sha1 cache, so translateLines never touches the network.
// The block prefix is split off BEFORE translation (splitBlockPrefix), so the
// cache is keyed on the content AFTER the prefix.

const fs = require('fs');
const os = require('os');
const path = require('path');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cctrans-markdown-'));
process.env.CCTRANS_HOME = TMP;

const assert = require('assert');
const { buildDisplayContent } = require('../src/interleave');
const { cacheKey } = require('../src/translate');
const { CACHE_DIR } = require('../src/config');

// Seeded values must DIFFER from the source content — an identical
// "translation" is treated as a backend echo and the translated line is
// suppressed.
const ZH = {
  'Fact / Inference': '事实 / 推断',
  'Fix the login bug': '修复登录缺陷',
  'Add retry logic': '添加重试逻辑',
  'The cache is content-addressed.': '缓存按内容寻址。',
  'This explains the command.': '这是对该命令的解释。',
};
fs.mkdirSync(CACHE_DIR, { recursive: true });
for (const [en, zh] of Object.entries(ZH)) {
  fs.writeFileSync(path.join(CACHE_DIR, cacheKey(en, 'zh-Hans', 'google') + '.txt'), zh);
}

async function lines(delta) {
  const r = await buildDisplayContent(delta, { backend: 'google', inFence: false });
  return r.displayContent === null ? null : r.displayContent.split('\n');
}

async function run() {
  // Heading: translated line is a heading of the SAME level, marker after the #s.
  let l = await lines('## Fact / Inference\n');
  assert.strictEqual(l[0], '## Fact / Inference');
  assert.ok(/^## ↳ /.test(l[1]), 'translated heading keeps "## " prefix, got: ' + l[1]);
  assert.ok(!l[1].includes('↳ #'), 'no literal # after the marker');

  // Bullet: translated line indents to the same width — no second bullet.
  l = await lines('- Fix the login bug\n');
  assert.ok(/^ {2}↳ /.test(l[1]), 'bullet translation indented 2 spaces, got: ' + l[1]);
  assert.ok(!/↳ [-*+] /.test(l[1]), 'no literal bullet after the marker');

  // Ordered item: same-width indent ("1. " -> 3 spaces).
  l = await lines('1. Add retry logic\n');
  assert.ok(/^ {3}↳ /.test(l[1]), 'ordered translation indented 3 spaces, got: ' + l[1]);

  // Blockquote: translation stays inside the quote.
  l = await lines('> The cache is content-addressed.\n');
  assert.ok(/^> ↳ /.test(l[1]), 'quote translation keeps "> " prefix, got: ' + l[1]);

  // Bullet whose content is a bare path: now classified code, not translated.
  l = await lines('- /usr/local/bin\n');
  assert.strictEqual(l, null, 'bullet of a bare path must not be translated');

  // Plain prose: unchanged behavior.
  l = await lines('This explains the command.\n');
  assert.ok(/^↳ /.test(l[1]), 'plain prose keeps the bare marker');

  console.log('PASS: block markdown stripped for translation and re-applied on the translated line.');
}

run().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
