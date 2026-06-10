'use strict';
// Verifies block markdown (headings, list items, blockquotes) is stripped
// before translation and re-applied to the translated line — so the renderer
// never shows a literal "##" / "-" / ">" after the ↳ marker.
const assert = require('assert');
const { buildDisplayContent } = require('../src/interleave');

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
