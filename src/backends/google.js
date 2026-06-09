'use strict';
// Free, unofficial Google Translate endpoint. No key, fast, medium quality.
const { getLang } = require('../langs');

async function translateOne(line, target) {
  const url =
    'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=' +
    encodeURIComponent(target) + '&dt=t&q=' + encodeURIComponent(line);
  const res = await fetch(url);
  if (!res.ok) throw new Error('google ' + res.status);
  const j = await res.json();
  return (j[0] || []).map((seg) => seg[0]).join('');
}

module.exports = {
  id: 'google',
  kind: 'mt',
  needs: 'nothing (free, unofficial endpoint)',
  available() { return true; },
  async translate(lines, langCode) {
    const lang = getLang(langCode);
    const target = lang ? lang.google : langCode;
    return Promise.all(lines.map((l) => translateOne(l, target).catch(() => l)));
  },
};
