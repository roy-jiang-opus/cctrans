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
// A long single-line paragraph (≈4800 chars) — at the old 9000-char cap its
// EN+ZH displayContent (~2×) overflowed and rendered UNTRANSLATED (the reported
// "end of a long document isn't translated" bug). DISPLAY_CAP is now 16000.
const LONG_EN = 'Continuous integration is a development practice. ' + 'x'.repeat(4800);
const LONG_ZH = '持续集成是一种开发实践。' + '词'.repeat(2400);
fs.mkdirSync(CACHE_DIR, { recursive: true });
for (const [en, zh] of Object.entries(ZH)) {
  fs.writeFileSync(path.join(CACHE_DIR, cacheKey(en, 'zh-Hans', 'google') + '.txt'), zh);
}
fs.writeFileSync(path.join(CACHE_DIR, cacheKey(LONG_EN, 'zh-Hans', 'google') + '.txt'), LONG_ZH);

async function lines(delta, extra) {
  const r = await buildDisplayContent(delta, Object.assign({ backend: 'google', inFence: false }, extra));
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

  // A long paragraph (EN+ZH ≈ 9700 chars) must still translate — it overflowed
  // the old 9000 cap and rendered untranslated.
  l = await lines(LONG_EN + '\n');
  assert.ok(l && l[1] && l[1].startsWith('↳ ' + LONG_ZH.slice(0, 12)),
    'a long paragraph over the OLD cap is now translated, not dropped');

  // --- adjustable line spacing (gapWithin / gapBetween) on an adjacent list ---
  const LIST = '- Fix the login bug\n- Add retry logic\n';
  // gapBetween:0 — tight, no blank between the two pairs (the pre-spacing look)
  l = await lines(LIST, { gapWithin: 0, gapBetween: 0 });
  assert.deepStrictEqual(l, ['- Fix the login bug', '  ↳ 修复登录缺陷', '- Add retry logic', '  ↳ 添加重试逻辑', ''],
    'gapBetween:0 keeps adjacent list pairs tight');
  // gapBetween:1 (default) — a blank line separates the two translated pairs
  l = await lines(LIST, { gapWithin: 0, gapBetween: 1 });
  assert.deepStrictEqual(l, ['- Fix the login bug', '  ↳ 修复登录缺陷', '', '- Add retry logic', '  ↳ 添加重试逻辑', ''],
    'gapBetween:1 separates adjacent translated lines with a blank');
  // gapWithin:1 — a blank between each English line and its translation
  l = await lines(LIST, { gapWithin: 1, gapBetween: 0 });
  assert.deepStrictEqual(l, ['- Fix the login bug', '', '  ↳ 修复登录缺陷', '- Add retry logic', '', '  ↳ 添加重试逻辑', ''],
    'gapWithin:1 separates each English line from its translation');
  // a single paragraph (next line is the trailing-\n artifact, not prose) gets
  // no gapBetween even at the default — only adjacent prose lines do.
  l = await lines('This explains the command.\n', { gapBetween: 1 });
  assert.deepStrictEqual(l, ['This explains the command.', '↳ 这是对该命令的解释。', ''],
    'a lone paragraph is not given a trailing gap');

  console.log('PASS: block markdown re-applied; long blocks kept; line spacing (gapWithin/gapBetween) adjustable.');
}

run().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
