'use strict';
// OpenAI gpt-4o-mini batch translation. High quality, preserves code/paths.
const { getLang } = require('../langs');

module.exports = {
  id: 'openai',
  kind: 'llm',
  needs: 'OPENAI_API_KEY',
  available() { return !!process.env.OPENAI_API_KEY; },
  async translate(lines, langCode, opts) {
    opts = opts || {};
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('no OPENAI_API_KEY');
    const lang = getLang(langCode);
    const name = lang ? lang.name : langCode;
    const sys =
      'You translate developer-tool chat into ' + name + '. ' +
      'Translate each input line to natural, concise ' + name + '. ' +
      'If a line is already in ' + name + ', return it unchanged. ' +
      'Keep inline code, file paths, URLs, identifiers, numbers, and leading markdown ' +
      'markers (#, -, *, >, digits., backticks) intact. ' +
      'Return ONLY JSON {"t":[...]} whose array has EXACTLY the same length and order ' +
      'as the input lines. Never merge, split, add, or drop lines.';
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({
        model: opts.model || process.env.TT_OPENAI_MODEL || 'gpt-4o-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: JSON.stringify({ lines }) },
        ],
      }),
    });
    if (!res.ok) throw new Error('openai ' + res.status + ' ' + (await res.text()).slice(0, 200));
    const j = await res.json();
    const parsed = JSON.parse(j.choices[0].message.content);
    const t = parsed.t || parsed.translations || parsed.lines;
    if (!Array.isArray(t) || t.length !== lines.length) {
      throw new Error('length mismatch ' + (t && t.length) + '/' + lines.length);
    }
    return t;
  },
};
