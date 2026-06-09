'use strict';
// Anthropic Claude Haiku batch translation via the Messages API (raw fetch —
// this project is dependency-free by design). Uses structured outputs
// (output_config.format json_schema) so {"t":[...]} is guaranteed valid JSON.
// Model claude-haiku-4-5: $1/M input, $5/M output — ~$0.0005 per delta.
const { getLang } = require('../langs');
const { getKey } = require('../keys');

const SCHEMA = {
  type: 'object',
  properties: { t: { type: 'array', items: { type: 'string' } } },
  required: ['t'],
  additionalProperties: false,
};

module.exports = {
  id: 'anthropic',
  kind: 'llm',
  needs: 'anthropic key (cctrans key anthropic <value>)',
  available() { return !!getKey('anthropic'); },
  async translate(lines, langCode, opts) {
    opts = opts || {};
    const key = getKey('anthropic');
    if (!key) throw new Error('no anthropic key');
    const lang = getLang(langCode);
    const name = lang ? lang.name : langCode;
    const sys =
      'You translate developer-tool chat into ' + name + '. ' +
      'Translate each input line to natural, concise ' + name + '. ' +
      'If a line is already in ' + name + ', return it unchanged. ' +
      'Keep inline code, file paths, URLs, identifiers, numbers, and leading markdown ' +
      'markers (#, -, *, >, digits., backticks) intact. ' +
      'Return {"t":[...]} with EXACTLY one translation per input line, same order. ' +
      'Never merge, split, add, or drop lines.';
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: opts.anthropicModel || require('../config').getState().anthropicModel,
        max_tokens: 4096,
        system: sys,
        output_config: { format: { type: 'json_schema', schema: SCHEMA } },
        messages: [{ role: 'user', content: JSON.stringify({ lines }) }],
      }),
    });
    if (!res.ok) throw new Error('anthropic ' + res.status + ' ' + (await res.text()).slice(0, 200));
    const j = await res.json();
    const text = (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    const t = JSON.parse(text).t;
    if (!Array.isArray(t) || t.length !== lines.length) {
      throw new Error('length mismatch ' + (t && t.length) + '/' + lines.length);
    }
    return t;
  },
};
