'use strict';
// Azure Translator (Cognitive Services). Large free tier (2M chars/month).
// The v3 endpoint accepts an array of {Text} and returns aligned results.
// Needs AZURE_TRANSLATOR_KEY and (for regional resources) AZURE_TRANSLATOR_REGION.
const { getLang } = require('../langs');

module.exports = {
  id: 'azure',
  kind: 'mt',
  needs: 'AZURE_TRANSLATOR_KEY (+ AZURE_TRANSLATOR_REGION)',
  available() { return !!process.env.AZURE_TRANSLATOR_KEY; },
  async translate(lines, langCode) {
    const key = process.env.AZURE_TRANSLATOR_KEY;
    if (!key) throw new Error('no AZURE_TRANSLATOR_KEY');
    const lang = getLang(langCode);
    const target = lang ? lang.azure : langCode;
    const endpoint = process.env.AZURE_TRANSLATOR_ENDPOINT || 'https://api.cognitive.microsofttranslator.com';
    const headers = { 'Content-Type': 'application/json', 'Ocp-Apim-Subscription-Key': key };
    if (process.env.AZURE_TRANSLATOR_REGION) headers['Ocp-Apim-Subscription-Region'] = process.env.AZURE_TRANSLATOR_REGION;
    const res = await fetch(endpoint + '/translate?api-version=3.0&to=' + encodeURIComponent(target), {
      method: 'POST',
      headers,
      body: JSON.stringify(lines.map((Text) => ({ Text }))),
    });
    if (!res.ok) throw new Error('azure ' + res.status + ' ' + (await res.text()).slice(0, 200));
    const j = await res.json();
    const t = j.map((x) => x.translations && x.translations[0] && x.translations[0].text);
    if (t.length !== lines.length || t.some((x) => typeof x !== 'string')) {
      throw new Error('bad azure response');
    }
    return t;
  },
};
