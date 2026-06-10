'use strict';
// AskUserQuestion dialog translation: PreToolUse rewrites the dialog into the
// target language (updatedInput), PostToolUse restores the selected answer to
// English (updatedToolOutput) so the model reads clean English. Offline via
// seeded cache; hook exercised end-to-end as child processes.
const fs = require('fs');
const os = require('os');
const path = require('path');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cctrans-dialog-'));
process.env.CCTRANS_HOME = TMP;
delete process.env.CCTRANS_DISABLE;

const assert = require('assert');
const { spawnSync } = require('child_process');
const { translateQuestions, restoreAnswer } = require('../src/dialog');
const { cacheKey } = require('../src/translate');
const { CACHE_DIR, DLGMAP_DIR } = require('../src/config');

const ZH = {
  'Which color do you prefer?': '你喜欢哪种颜色？',
  'Red': '红色', 'Blue': '蓝色', 'Color': '颜色',
  'A warm, bold color': '温暖、大胆的颜色',
  'A cool, calm color': '清凉、平静的颜色',
};
fs.mkdirSync(CACHE_DIR, { recursive: true });
for (const [en, zh] of Object.entries(ZH)) {
  fs.writeFileSync(path.join(CACHE_DIR, cacheKey(en, 'zh-Hans', 'google') + '.txt'), zh);
}
const TOOL_INPUT = {
  questions: [{
    question: 'Which color do you prefer?',
    header: 'Color',
    options: [
      { label: 'Red', description: 'A warm, bold color' },
      { label: 'Blue', description: 'A cool, calm color' },
    ],
    multiSelect: false,
  }],
};
const baseOpts = { target: 'zh-Hans', backend: 'google', marker: '↳ ', timeoutMs: 2000 };

async function run() {
  // --- APPEND mode: bilingual question/labels/descriptions, header pure-target ---
  let r = await translateQuestions(TOOL_INPUT, Object.assign({ display: 'append' }, baseOpts));
  const q = r.updatedInput.questions[0];
  assert.strictEqual(q.question, 'Which color do you prefer?\n↳ 你喜欢哪种颜色？', 'question bilingual');
  assert.strictEqual(q.header, '颜色', 'header pure-target (chip)');
  assert.strictEqual(q.options[0].label, 'Red\n↳ 红色', 'label bilingual');
  assert.strictEqual(q.options[0].description, 'A warm, bold color\n↳ 温暖、大胆的颜色', 'description bilingual');
  // PreToolUse must NOT carry permissionDecision (that would auto-run headless) — the hook only
  // emits updatedInput; that contract is enforced in the hook, asserted in the e2e section below.

  // Restore: the user "picked" the bilingual Red; the model must read English.
  let resp = {
    questions: r.updatedInput.questions,
    answers: { 'Which color do you prefer?\n↳ 你喜欢哪种颜色？': 'Red\n↳ 红色' },
    annotations: {},
  };
  let restored = restoreAnswer(resp, r.map);
  assert.deepStrictEqual(restored.answers, { 'Which color do you prefer?': 'Red' },
    'append: answer key (question) + value (label) restored to English');
  assert.strictEqual(restored.questions[0].options[0].label, 'Red', 'nested label restored to EN');
  assert.strictEqual(restored.questions[0].question, 'Which color do you prefer?', 'nested question restored to EN');

  // --- REPLACE mode: pure-target labels; restore still yields English ---
  r = await translateQuestions(TOOL_INPUT, Object.assign({ display: 'replace' }, baseOpts));
  assert.strictEqual(r.updatedInput.questions[0].options[0].label, '红色', 'replace: label pure target');
  assert.strictEqual(r.updatedInput.questions[0].question, '你喜欢哪种颜色？', 'replace: question pure target');
  resp = { questions: r.updatedInput.questions, answers: { '你喜欢哪种颜色？': '红色' }, annotations: {} };
  restored = restoreAnswer(resp, r.map);
  assert.deepStrictEqual(restored.answers, { 'Which color do you prefer?': 'Red' }, 'replace: answer restored to English');

  // --- multi-select: ", "-joined labels each map back ---
  resp = { questions: r.updatedInput.questions, answers: { '你喜欢哪种颜色？': '红色, 蓝色' }, annotations: {} };
  restored = restoreAnswer(resp, r.map);
  assert.strictEqual(restored.answers['Which color do you prefer?'], 'Red, Blue', 'multi-select restored');

  // --- free-text answer (not in the map) passes through verbatim ---
  resp = { questions: r.updatedInput.questions, answers: { '你喜欢哪种颜色？': 'I prefer green' }, annotations: {} };
  restored = restoreAnswer(resp, r.map);
  assert.strictEqual(restored.answers['Which color do you prefer?'], 'I prefer green', 'free text untouched');

  // --- nothing translatable -> null (leave the dialog English) ---
  const none = await translateQuestions({ questions: [{ question: '你好', header: '', options: [{ label: '红色', description: '' }] }] },
    Object.assign({ display: 'append' }, baseOpts));
  assert.strictEqual(none, null, 'already-target dialog: nothing to translate -> null');
  assert.strictEqual(await translateQuestions({ questions: [] }, baseOpts), null, 'no questions -> null');

  // --- hook end-to-end (real child processes) ---
  fs.writeFileSync(path.join(TMP, 'state.json'),
    JSON.stringify({ enabled: true, backend: 'google', target: 'zh-Hans', mode: 'line', display: 'append', dialog: true }));
  const runHook = (payload) => {
    const res = spawnSync(process.execPath, [path.join(__dirname, '..', 'hook', 'ask-user-question.js')], {
      input: JSON.stringify(payload), env: process.env, encoding: 'utf8', timeout: 15000,
    });
    assert.strictEqual(res.status, 0, 'hook exits 0; stderr: ' + res.stderr);
    return res.stdout ? JSON.parse(res.stdout) : null;
  };
  // PreToolUse: rewrites input, no permissionDecision, stashes map
  const pre = runHook({ hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion', tool_use_id: 'd1', tool_input: TOOL_INPUT });
  assert.strictEqual(pre.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.ok(!('permissionDecision' in pre.hookSpecificOutput), 'PreToolUse must NOT set permissionDecision');
  assert.strictEqual(pre.hookSpecificOutput.updatedInput.questions[0].options[0].label, 'Red\n↳ 红色');
  assert.ok(fs.existsSync(path.join(DLGMAP_DIR, 'd1.json')), 'restore map stashed by tool_use_id');
  // PostToolUse: restores the answer, consumes the map
  const post = runHook({
    hook_event_name: 'PostToolUse', tool_name: 'AskUserQuestion', tool_use_id: 'd1',
    tool_response: { questions: pre.hookSpecificOutput.updatedInput.questions, answers: { 'Which color do you prefer?\n↳ 你喜欢哪种颜色？': 'Red\n↳ 红色' }, annotations: {} },
  });
  assert.strictEqual(post.hookSpecificOutput.hookEventName, 'PostToolUse');
  assert.deepStrictEqual(post.hookSpecificOutput.updatedToolOutput.answers, { 'Which color do you prefer?': 'Red' },
    'hook restores the model-visible answer to English');
  assert.ok(!fs.existsSync(path.join(DLGMAP_DIR, 'd1.json')), 'map consumed (unlinked) after restore');

  // Non-AskUserQuestion tool: passthrough (no stdout)
  assert.strictEqual(runHook({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_use_id: 'b1', tool_input: { command: 'ls' } }), null,
    'other tools pass through untouched');
  // dialog disabled: passthrough
  fs.writeFileSync(path.join(TMP, 'state.json'),
    JSON.stringify({ enabled: true, backend: 'google', target: 'zh-Hans', dialog: false }));
  assert.strictEqual(runHook({ hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion', tool_use_id: 'd2', tool_input: TOOL_INPUT }), null,
    'dialog off -> passthrough');

  console.log('PASS: dialog translation — bilingual/replace rewrite, answer restored to English (incl. multi-select + free text), hook Pre/Post end-to-end.');
}

run().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
