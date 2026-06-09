'use strict';
// DeepL API. Best traditional-MT quality. Free keys end in ":fx" and use the
// api-free host. The /v2/translate endpoint accepts an array of texts and
// returns translations in the same order — perfect line mapping for free.
const { getLang } = require('../langs');
const { getKey } = require('../keys');

module.exports = {
  id: 'deepl',
  kind: 'mt',
  needs: 'deepl key (cctrans key deepl <value>)',
  available() { return !!getKey('deepl'); },
  async translate(lines, langCode) {
    const key = getKey('deepl');
    if (!key) throw new Error('no deepl key');
    const lang = getLang(langCode);
    const target = lang ? lang.deepl : String(langCode).toUpperCase();
    const host = key.endsWith(':fx') ? 'api-free.deepl.com' : 'api.deepl.com';
    const res = await fetch('https://' + host + '/v2/translate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'DeepL-Auth-Key ' + key,
      },
      body: JSON.stringify({ text: lines, target_lang: target, preserve_formatting: true }),
    });
    if (!res.ok) throw new Error('deepl ' + res.status + ' ' + (await res.text()).slice(0, 200));
    const j = await res.json();
    const t = (j.translations || []).map((x) => x.text);
    if (t.length !== lines.length) throw new Error('length mismatch ' + t.length + '/' + lines.length);
    return t;
  },
};
