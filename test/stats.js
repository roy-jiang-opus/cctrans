'use strict';
// Usage stats: JSONL recording (concurrency-safe append), aggregation,
// token-saving estimate, and journal compaction.
const fs = require('fs');
const os = require('os');
const path = require('path');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cctrans-stats-'));
process.env.CCTRANS_HOME = TMP;

const assert = require('assert');
const stats = require('../src/stats');
const { translateLines, cacheKey } = require('../src/translate');
const { CACHE_DIR } = require('../src/config');

async function run() {
  // translateLines records usage — including pure-cache-hit calls.
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(path.join(CACHE_DIR, cacheKey('Hello world.', 'zh-Hans', 'google') + '.txt'), '你好，世界。');
  await translateLines(['Hello world.'], { target: 'zh-Hans', backend: 'google', timeoutMs: 2000 });
  let recs = stats.readRecords();
  assert.strictEqual(recs.length, 1, 'one record per translateLines call');
  assert.strictEqual(recs[0].n, 1);
  assert.strictEqual(recs[0].hit, 1, 'cache-hit-only calls still count');
  assert.strictEqual(recs[0].tg, 'zh-Hans');

  // Aggregation + the saved-tokens estimate (zh ratio 2.5 -> chars/4 * 1.5).
  const agg = stats.aggregate(recs);
  assert.strictEqual(agg.lines, 1);
  assert.strictEqual(agg.savedTokens, Math.round(('Hello world.'.length / 4) * 1.5));
  assert.ok(agg.byTarget['zh-Hans']);

  // sinceMs filtering.
  assert.strictEqual(stats.aggregate(recs, Date.now() + 1000).lines, 0, 'future cutoff excludes everything');

  // Torn/garbage lines are skipped, not fatal.
  fs.appendFileSync(stats.STATS_FILE, '{broken\n');
  stats.record({ n: 2, ch: 80, hit: 0, tg: 'ru', be: 'google' });
  recs = stats.readRecords();
  assert.strictEqual(recs.length, 2, 'garbage line skipped, valid records kept');

  // Compaction folds old months into per-(month,target) summaries.
  const old = Date.parse('2026-01-15T12:00:00Z');
  const pad = JSON.stringify({ t: old, n: 1, ch: 40, hit: 0, tg: 'ja', be: 'google', pad: 'x'.repeat(4000) });
  const lines = [];
  for (let i = 0; i < 600; i++) lines.push(pad);
  fs.appendFileSync(stats.STATS_FILE, lines.join('\n') + '\n');
  assert.ok(fs.statSync(stats.STATS_FILE).size > 2 * 1024 * 1024, 'journal grown past the compaction threshold');
  assert.ok(stats.compactIfNeeded(), 'compaction runs');
  const after = stats.readRecords();
  const jaSummaries = after.filter((r) => r.tg === 'ja');
  assert.strictEqual(jaSummaries.length, 1, '600 old ja records folded into one monthly summary');
  assert.strictEqual(jaSummaries[0].n, 600, 'summary preserves the line count');
  const aggAfter = stats.aggregate(after);
  assert.strictEqual(aggAfter.lines, 600 + 1 + 2, 'totals identical after compaction');
  assert.ok(fs.statSync(stats.STATS_FILE).size < 100 * 1024, 'journal actually shrank');

  console.log('PASS: stats — recording (incl. cache hits), aggregation, saved-tokens estimate, torn lines, compaction.');
}

run().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
