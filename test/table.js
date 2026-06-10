'use strict';
// Markdown tables: a table's rows must pass through as a UNIT (no ZH line
// spliced between the header and the |---| delimiter — the bug that broke
// CommonMark table parsing), threaded across deltas like the fence flag, and a
// translated copy is appended after the table. Offline via seeded cache.
const fs = require('fs');
const os = require('os');
const path = require('path');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cctrans-table-'));
process.env.CCTRANS_HOME = TMP;
delete process.env.CCTRANS_DISABLE;
delete process.env.CCTRANS_DEBUG_STDIN;

const assert = require('assert');
const { spawnSync } = require('child_process');
const { classify, buildDisplayContent, planSections, renderSections, isDelimiterRow, isTableRow } = require('../src/interleave');
const { cacheKey } = require('../src/translate');
const { CACHE_DIR, MSGSTATE_DIR } = require('../src/config');

const ZH = {
  'Flag': '标志', 'Effect': '效果', 'Default': '默认值',
  '-a': '-a', 'all files': '所有文件', 'off': '关闭',
  '-v': '-v', 'verbose': '详细', 'Here are the flags:': '以下是参数：',
  'That is the list.': '以上就是列表。',
};
fs.mkdirSync(CACHE_DIR, { recursive: true });
for (const [en, zh] of Object.entries(ZH)) {
  fs.writeFileSync(path.join(CACHE_DIR, cacheKey(en, 'zh-Hans', 'google') + '.txt'), zh);
}
const OPTS = { target: 'zh-Hans', backend: 'google', timeoutMs: 2000 };

async function run() {
  // --- predicates ---
  assert.ok(isDelimiterRow('|---|---|'));
  assert.ok(isDelimiterRow('| :--- | ---: |'));
  assert.ok(!isDelimiterRow('| a | b |'), 'a row with letters is not a delimiter');
  assert.ok(!isDelimiterRow('just dashes ---'), 'no pipe = not a delimiter');
  assert.ok(isTableRow('| a | b |'));
  assert.ok(!isTableRow('plain prose'));

  // --- classify tags a whole table 'table', not prose/code ---
  const tbl = ['| Flag | Effect |', '|------|--------|', '| -a | all files |', '| -v | verbose |'];
  const { plan, inTable } = classify(tbl, false, 'zh-Hans', false);
  assert.deepStrictEqual(plan.map((p) => p.kind), ['table', 'table', 'table', 'table'],
    'every table row is kind:table (delimiter included) — none translated as prose/code');
  assert.strictEqual(inTable, true, 'table left open at end of delta (no closing line)');

  // --- THE BUG: no ZH line is ever spliced between header and delimiter ---
  // Whole table + a closing blank in one delta (line mode).
  const oneDelta = '| Flag | Effect |\n|------|--------|\n| -a | all files |\n| -v | verbose |\n\n';
  const r = await buildDisplayContent(oneDelta, Object.assign({ final: true }, OPTS));
  const lines = r.displayContent.split('\n');
  // The first 4 lines are the ORIGINAL table verbatim, intact and contiguous.
  assert.strictEqual(lines[0], '| Flag | Effect |');
  assert.strictEqual(lines[1], '|------|--------|', 'delimiter immediately follows header — table not split');
  assert.strictEqual(lines[2], '| -a | all files |');
  assert.strictEqual(lines[3], '| -v | verbose |');
  // A translated copy follows (separated by a blank), itself a valid table.
  const after = lines.slice(4).filter((l) => l.trim() !== '');
  assert.ok(after.length >= 4, 'a translated table is appended');
  assert.ok(/标志/.test(after[0]) && /效果/.test(after[0]), 'translated header: ' + after[0]);
  assert.ok(isDelimiterRow(after[1]), 'translated table has its own delimiter row');
  assert.ok(/所有文件/.test(after.join('\n')), 'cell contents translated');
  assert.strictEqual(r.inTable, false, 'table closed by the blank line');

  // --- cross-delta: header+delimiter in delta 0, rows + close in delta 1 ---
  const d0 = '| Flag | Effect |\n|------|--------|\n';
  const r0 = await buildDisplayContent(d0, Object.assign({ inFence: false, inTable: false, tableBuf: [] }, OPTS));
  assert.strictEqual(r0.displayContent, null, 'open table delta passes through untouched');
  assert.strictEqual(r0.inTable, true);
  assert.deepStrictEqual(r0.tableBuf, ['| Flag | Effect |', '|------|--------|'], 'header+delimiter buffered');
  const d1 = '| -a | all files |\n| -v | verbose |\n\n';
  const r1 = await buildDisplayContent(d1, Object.assign({ inFence: false, inTable: true, tableBuf: r0.tableBuf, final: true }, OPTS));
  const l1 = r1.displayContent.split('\n');
  assert.strictEqual(l1[0], '| -a | all files |', 'delta 1 data rows pass through verbatim first');
  assert.strictEqual(l1[1], '| -v | verbose |');
  assert.ok(/标志/.test(r1.displayContent), 'full translated table (header from delta 0) appended in delta 1');
  assert.strictEqual(r1.inTable, false);

  // --- a table mixed with prose: prose translates, table stays intact ---
  const mixed = 'Here are the flags:\n\n| Flag | Effect |\n|------|--------|\n| -a | all files |\n\nThat is the list.\n';
  const rm = await buildDisplayContent(mixed, Object.assign({ final: true }, OPTS));
  const lm = rm.displayContent.split('\n');
  assert.ok(/以下是参数/.test(lm[1]), 'prose before the table is translated (line mode)');
  const hdr = lm.indexOf('| Flag | Effect |');
  assert.ok(hdr > -1 && lm[hdr + 1] === '|------|--------|', 'table header+delimiter still contiguous in mixed content');
  assert.ok(/以上就是列表/.test(rm.displayContent), 'prose after the table is translated');

  // --- section mode passes the table through and appends a translated copy ---
  const planned = planSections(oneDelta, { inFence: false, inTable: false, buf: [], tableBuf: [], target: 'zh-Hans', final: true });
  assert.strictEqual(planned.tableFlushes.length, 1, 'section mode records a table flush');
  const sdc = await renderSections(planned, OPTS);
  const sl = sdc.split('\n');
  assert.strictEqual(sl[0], '| Flag | Effect |');
  assert.strictEqual(sl[1], '|------|--------|', 'section mode keeps the table intact too');
  assert.ok(/标志/.test(sdc), 'section mode appends the translated table');

  // --- chunking invariance: one delta vs split must yield the same screen ---
  // (the appended translated table is identical regardless of delta boundaries)
  assert.ok(/标志/.test(r.displayContent) && /标志/.test(r1.displayContent),
    'translated table appears whether the table arrived in one delta or two');

  // --- blockquote tables: detected, passed through, ZH never spliced mid-table ---
  for (const [en, zh] of Object.entries({ 'a': '甲', 'b': '乙', 'x': '丙', 'y': '丁' })) {
    fs.writeFileSync(path.join(CACHE_DIR, cacheKey(en, 'zh-Hans', 'google') + '.txt'), zh);
  }
  const bq = classify(['> | a | b |', '> |---|---|', '> | x | y |'], false, 'zh-Hans', false);
  assert.deepStrictEqual(bq.plan.map((p) => p.kind), ['table', 'table', 'table'],
    'blockquote table rows are kind:table (no ZH spliced between > header and > delimiter)');
  const rbq = await buildDisplayContent('> | a | b |\n> |---|---|\n> | x | y |\n\n', Object.assign({ final: true }, OPTS));
  const lbq = rbq.displayContent.split('\n');
  assert.strictEqual(lbq[0], '> | a | b |');
  assert.strictEqual(lbq[1], '> |---|---|', 'blockquote table header+delimiter stay contiguous');
  assert.ok(/^> \| 甲 \| 乙 \|/.test(rbq.displayContent.split('\n').find((l) => /甲/.test(l)) || ''),
    'translated blockquote table keeps the > prefix');

  // --- escaped pipe in a cell survives the split/rebuild (no space-mangling) ---
  fs.writeFileSync(path.join(CACHE_DIR, cacheKey('a \\| b', 'zh-Hans', 'google') + '.txt'), '甲 \\| 乙');
  const esc = await buildDisplayContent('| col |\n|-----|\n| a \\| b |\n\n', Object.assign({ final: true }, OPTS));
  assert.ok(/甲 \\\| 乙/.test(esc.displayContent), 'escaped pipe preserved in translated cell: ' + esc.displayContent);

  // --- empty final delta flushing an all-identity table must NOT emit "" ---
  // (identity cache: translation == source for every cell -> nothing to splice)
  for (const v of ['1', '2', '3', '4']) {
    fs.writeFileSync(path.join(CACHE_DIR, cacheKey(v, 'zh-Hans', 'google') + '.txt'), v);
  }
  const idOpen = await buildDisplayContent('| 1 | 2 |\n|---|---|\n| 3 | 4 |\n', Object.assign({ inTable: false, tableBuf: [] }, OPTS));
  const idFinal = await buildDisplayContent('', Object.assign({ inTable: idOpen.inTable, tableBuf: idOpen.tableBuf, final: true }, OPTS));
  assert.strictEqual(idFinal.displayContent, null, 'all-identity table on an empty final delta returns null, never ""');

  // --- a fence resets table state (``` inside must not be seen as a table) ---
  const fenceReset = classify(['| a | b |', '|---|---|', '```', '| not | table |', '```'], false, 'zh-Hans', false);
  assert.strictEqual(fenceReset.plan[2].kind, 'code', 'fence line is code');
  assert.strictEqual(fenceReset.plan[3].kind, 'code', 'inside a fence, a pipe line is code, not a table row');

  // --- hook end-to-end (real child process, state in msgstate/) ---
  fs.writeFileSync(path.join(TMP, 'state.json'),
    JSON.stringify({ enabled: true, backend: 'google', target: 'zh-Hans', mode: 'line' }));
  const runHook = (payload) => {
    const res = spawnSync(process.execPath, [path.join(__dirname, '..', 'hook', 'message-display.js')], {
      input: JSON.stringify(payload), env: process.env, encoding: 'utf8', timeout: 15000,
    });
    assert.strictEqual(res.status, 0, 'hook exits 0; stderr: ' + res.stderr);
    return res.stdout ? JSON.parse(res.stdout).hookSpecificOutput.displayContent : null;
  };
  // delta 0 = header+delimiter (open table) -> passes through (null), state saved
  assert.strictEqual(runHook({ message_id: 'tbl1', index: 0, final: false, delta: d0 }), null);
  assert.ok(fs.existsSync(path.join(MSGSTATE_DIR, 'tbl1.json')), 'msgstate persists the open table');
  const saved = JSON.parse(fs.readFileSync(path.join(MSGSTATE_DIR, 'tbl1.json'), 'utf8'));
  assert.strictEqual(saved.inTable, true);
  assert.deepStrictEqual(saved.tableBuf, ['| Flag | Effect |', '|------|--------|']);
  // delta 1 = data rows + close -> translated table appended
  const dc1 = runHook({ message_id: 'tbl1', index: 1, final: true, delta: d1 });
  assert.ok(dc1 && /标志/.test(dc1) && dc1.startsWith('| -a | all files |'), 'hook appends translated table on close');
  assert.ok(!fs.existsSync(path.join(MSGSTATE_DIR, 'tbl1.json')), 'final delta removes msgstate');

  console.log('PASS: tables pass through intact (never split), thread across deltas, get a translated copy appended — line, section, and hook.');
}

run().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
