'use strict';
// Section mode: English passes through as it streams; a grouped "↳" block is
// spliced in when a section closes. Verifies text-anchored boundaries (blank /
// code / target / heading / cap / final), cross-delta buffering, chunking
// invariance (repaint safety), identity suppression, and the hook's
// state-commit-before-translate path end-to-end via real child processes.
//
// Deterministic: CCTRANS_HOME points at a temp dir and every prose line is
// pre-seeded into the sha1 cache, so translateLines never touches the network.

const fs = require('fs');
const os = require('os');
const path = require('path');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cctrans-section-'));
process.env.CCTRANS_HOME = TMP;
delete process.env.CCTRANS_DISABLE;
delete process.env.CCTRANS_DEBUG_STDIN;

const assert = require('assert');
const { spawnSync } = require('child_process');
const { planSections, renderSections } = require('../src/interleave');
const { cacheKey } = require('../src/translate');
const { CACHE_DIR, MSGSTATE_DIR } = require('../src/config');

const ZH = {
  'Performance Tips': '性能技巧',
  'Caching cuts repeated translation cost to zero.': '缓存将重复翻译的成本降为零。',
  'Use these flags:': '使用以下参数：',
  'Enable the cache': '启用缓存',
  'Set a small timeout': '设置较短的超时',
  'Prefer the batch API': '优先使用批量 API',
  'Restart the session afterwards.': '之后请重启会话。',
  'Here is the fix:': '这是修复方法：',
  'Steps': '步骤',
  'item one': '项目一',
  'item two': '项目二',
  'Identity line stays.': 'Identity line stays.', // backend echo -> suppressed
};
fs.mkdirSync(CACHE_DIR, { recursive: true });
for (const [en, zh] of Object.entries(ZH)) {
  fs.writeFileSync(path.join(CACHE_DIR, cacheKey(en, 'zh-Hans', 'google') + '.txt'), zh);
}

const OPTS = { target: 'zh-Hans', backend: 'google', timeoutMs: 2000 };
async function render(delta, st) {
  st = st || {};
  const planned = planSections(delta, { inFence: !!st.inFence, buf: st.buf || [], target: 'zh-Hans', final: !!st.final });
  return { dc: await renderSections(planned, OPTS), planned };
}

function runHook(payload) {
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'hook', 'message-display.js')], {
    input: JSON.stringify(payload), env: process.env, encoding: 'utf8', timeout: 15000,
  });
  assert.strictEqual(r.status, 0, 'hook must exit 0, got ' + r.status + ' stderr: ' + r.stderr);
  return r.stdout ? JSON.parse(r.stdout).hookSpecificOutput.displayContent : null;
}

async function run() {
  // Heading and paragraph each close in the same delta their trailing blank
  // arrives in; both render in line-mode position.
  let r = await render('## Performance Tips\n\nCaching cuts repeated translation cost to zero.\n\n');
  assert.strictEqual(r.dc,
    '## Performance Tips\n## ↳ 性能技巧\n\nCaching cuts repeated translation cost to zero.\n↳ 缓存将重复翻译的成本降为零。\n\n');

  // Heading directly followed by a list (no blank): the heading closes its own
  // section — its ZH stays under it instead of displacing below the list.
  r = await render('## Steps\n- item one\n- item two\n\n');
  // heading is a single-line section (tight under its English); the 2-item list
  // is a GROUPED block — a leading blank, ONE ↳ on the first line, the rest
  // aligned under it.
  assert.strictEqual(r.dc, '## Steps\n## ↳ 步骤\n- item one\n- item two\n\n↳ 项目一\n  项目二\n\n');

  // A fence opening mid-delta closes the section; code passes through.
  r = await render('Here is the fix:\n```bash\ngit rebase main\n```\n\n');
  assert.strictEqual(r.dc, 'Here is the fix:\n↳ 这是修复方法：\n```bash\ngit rebase main\n```\n\n');
  assert.strictEqual(r.planned.inFence, false);

  // A single-\n tail means the block continues: list items buffer, no flush.
  r = await render('- Enable the cache\n');
  assert.strictEqual(r.dc, null, 'open section must leave the delta untouched');
  assert.strictEqual(r.planned.buf.length, 1);

  // Cross-delta list: items 1-2 buffer in delta 0; the closing delta splices
  // the whole grouped block after the last item, before the re-emitted blank.
  const d0 = 'Use these flags:\n\n- Enable the cache\n- Set a small timeout\n';
  const d1 = '- Prefer the batch API\n\nRestart the session afterwards.';
  const r0 = await render(d0);
  assert.strictEqual(r0.dc, 'Use these flags:\n↳ 使用以下参数：\n\n- Enable the cache\n- Set a small timeout\n');
  assert.strictEqual(r0.planned.buf.length, 2);
  const r1 = await render(d1, { buf: r0.planned.buf, final: true });
  assert.strictEqual(r1.dc,
    '- Prefer the batch API\n\n↳ 启用缓存\n  设置较短的超时\n  优先使用批量 API\n\nRestart the session afterwards.\n↳ 之后请重启会话。');

  // Chunking invariance (repaint safety): the same text processed as one final
  // delta must equal the concatenation of the per-delta outputs above.
  const whole = await render(d0 + d1, { final: true });
  assert.strictEqual(whole.dc, r0.dc + r1.dc, 'splice positions must be text-anchored, not delta-anchored');

  // An already-target line is a boundary and passes through untouched.
  r = await render('Use these flags:\n这是一行中文说明文字。\n\n');
  assert.strictEqual(r.dc, 'Use these flags:\n↳ 使用以下参数：\n这是一行中文说明文字。\n\n');

  // Backend echo (identity) suppresses the block entirely -> original English.
  r = await render('Identity line stays.\n\n');
  assert.strictEqual(r.dc, null);

  // Soft cap (6000 chars) forces a flush mid-run on a non-list line...
  const big = [];
  for (let i = 1; i <= 5; i++) {
    const line = 'Long line ' + i + ' ' + 'lorem'.repeat(300);
    big.push(line);
    fs.writeFileSync(path.join(CACHE_DIR, cacheKey(line, 'zh-Hans', 'google') + '.txt'), '长行' + i);
  }
  r = await render(big.join('\n') + '\n');
  assert.strictEqual(r.planned.flushes.length, 1, 'cap must force a flush with no other boundary');
  assert.strictEqual(r.planned.flushes[0].entries.length + r.planned.buf.length, 5,
    'every line is either flushed or still buffered');
  assert.ok(r.planned.flushes[0].entries.length >= 4, 'the flush fires at the cap crossing, got ' + r.planned.flushes[0].entries.length);
  // ...but defers past list items below the hard cap.
  const bigList = big.map((l) => '- ' + l);
  for (const l of bigList) {
    fs.writeFileSync(path.join(CACHE_DIR, cacheKey(l.slice(2), 'zh-Hans', 'google') + '.txt'), '长项');
  }
  r = await render(bigList.join('\n') + '\n');
  assert.strictEqual(r.planned.flushes.length, 0, 'cap flush must defer past list items below the hard cap');
  assert.strictEqual(r.planned.buf.length, 5);

  // An empty final delta still flushes a non-empty carried buffer.
  r = await render('', { buf: r0.planned.buf, final: true });
  assert.strictEqual(r.planned.flushes.length, 1, 'final must flush the carried buffer even with no delta text');

  // --- Hook end-to-end (real child processes, state in msgstate/) ---
  fs.writeFileSync(path.join(TMP, 'state.json'),
    JSON.stringify({ enabled: true, backend: 'google', target: 'zh-Hans', mode: 'section' }));

  assert.strictEqual(runHook({ message_id: 'm1', index: 0, final: false, delta: d0 }), r0.dc);
  assert.strictEqual(runHook({ message_id: 'm1', index: 1, final: true, delta: d1 }), r1.dc);
  assert.ok(!fs.existsSync(path.join(MSGSTATE_DIR, 'm1.json')), 'final delta must remove the msgstate file');

  // Index gap (a delta crashed unsaved): the buffer is dropped, never spliced
  // at a later, wrong boundary — the closing delta's own lines still translate.
  assert.strictEqual(runHook({ message_id: 'm2', index: 0, final: false, delta: '- Enable the cache\n' }), null);
  assert.ok(fs.existsSync(path.join(MSGSTATE_DIR, 'm2.json')), 'open section must persist its buffer');
  const gapDc = runHook({ message_id: 'm2', index: 2, final: true, delta: 'Restart the session afterwards.' });
  assert.strictEqual(gapDc, 'Restart the session afterwards.\n↳ 之后请重启会话。');

  // Disabled -> hook emits nothing regardless of buffered state.
  fs.writeFileSync(path.join(TMP, 'state.json'),
    JSON.stringify({ enabled: false, backend: 'google', target: 'zh-Hans', mode: 'section' }));
  assert.strictEqual(runHook({ message_id: 'm3', index: 0, final: false, delta: d0 }), null);

  console.log('PASS: section mode — text-anchored boundaries, cross-delta buffering, chunking invariance, hook state lifecycle.');
}

run().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
