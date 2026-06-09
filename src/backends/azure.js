'use strict';
// Azure Translator (Cognitive Services). Large free tier (2M chars/month).
// The v3 endpoint accepts an array of {Text} and returns aligned results.
// Needs AZURE_TRANSLATOR_KEY and (for regional resources) AZURE_TRANSLATOR_REGION.
const { getLang } = require('../langs');
const { getKey } = require('../keys');

module.exports = {
  id: 'azure',
  kind: 'mt',
  needs: 'azure key (tt key azure <value>; region: tt key azure-region <value>)',
  available() { return !!getKey('azure'); },
  async translate(lines, langCode) {
    const key = getKey('azure');
    if (!key) throw new Error('no azure key');
    const lang = getLang(langCode);
    const target = lang ? lang.azure : langCode;
    const endpoint = require('../config').getState().azureEndpoint;
    const headers = { 'Content-Type': 'application/json', 'Ocp-Apim-Subscription-Key': key };
    const region = getKey('azure-region');
    if (region) headers['Ocp-Apim-Subscription-Region'] = region;
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
