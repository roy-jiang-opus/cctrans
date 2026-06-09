'use strict';
// Claude Code headless backend: shells out to `claude -p` so translation runs
// on the user's Claude subscription (no separate API key). Measured ~3s per
// call (CLI startup) — usable within the hook's 10s budget but noticeably
// slower than HTTP backends; offered as the no-key option, not the default.
// TT_DISABLE=1 is set on the child as a recursion guard (the hook exits early
// when it sees it), and --settings {} -style hook loading is avoided by -p
// print mode having no display path.
const { execFile } = require('child_process');
const { getLang } = require('../langs');

function runClaude(prompt, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = execFile(
      'claude',
      ['-p', '--model', 'claude-haiku-4-5', '--output-format', 'text'],
      {
        timeout: timeoutMs,
        env: Object.assign({}, process.env, { TT_DISABLE: '1' }),
        maxBuffer: 1024 * 1024,
      },
      (err, stdout) => (err ? reject(err) : resolve(stdout)),
    );
    child.stdin.end(prompt);
  });
}

module.exports = {
  id: 'claude-code',
  kind: 'cli',
  needs: 'claude CLI logged in (uses your subscription; ~3s/call)',
  available() { return !process.env.TT_DISABLE; },
  async translate(lines, langCode, opts) {
    opts = opts || {};
    const lang = getLang(langCode);
    const name = lang ? lang.name : langCode;
    const prompt =
      'Translate each line of the following JSON array into ' + name + '. ' +
      'If a line is already in ' + name + ', return it unchanged. ' +
      'Keep inline code, file paths, URLs, identifiers, and markdown markers intact. ' +
      'Return ONLY JSON {"t":[...]} with exactly one translation per input line, same order. ' +
      'No prose, no code fences.\n' + JSON.stringify(lines);
    const out = await runClaude(prompt, opts.timeoutMs || 15000);
    // The CLI may wrap output in ```json fences — strip before parsing.
    const cleaned = out.replace(/^[\s\S]*?(\{)/, '$1').replace(/```[\s\S]*$/, '').trim();
    const t = JSON.parse(cleaned).t;
    if (!Array.isArray(t) || t.length !== lines.length) {
      throw new Error('length mismatch ' + (t && t.length) + '/' + lines.length);
    }
    return t;
  },
};
