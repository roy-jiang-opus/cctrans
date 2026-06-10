'use strict';
// Latin-script target languages (es/pt/fr/de): registry entries + the
// stopword-based already-target detection. The detector must be CONSERVATIVE:
// a false positive silently skips translation (expensive mistake); a false
// negative re-translates and the identity check suppresses the echo (cheap).
const assert = require('assert');
const { getLang, listLangs, isProbablyTarget } = require('../src/langs');

// Registry: all four languages resolvable, advertised, with backend codes.
for (const code of ['es', 'pt', 'fr', 'de']) {
  const lang = getLang(code);
  assert.ok(lang, code + ' registered');
  assert.ok(lang.google && lang.deepl && lang.azure, code + ' has backend codes');
  assert.ok(lang.ratio > 1, code + ' has a token-cost ratio');
  assert.ok(listLangs().includes(code), code + ' advertised by listLangs');
}

// Real target-language sentences must be detected.
assert.ok(isProbablyTarget('Esto modifica la configuración del proyecto para usar el nuevo backend.', 'es'), 'Spanish sentence detected');
assert.ok(isProbablyTarget('Isso modifica a configuração do projeto para usar o novo backend.', 'pt'), 'Portuguese sentence detected');
assert.ok(isProbablyTarget('Cela modifie la configuration du projet pour utiliser le nouveau backend.', 'fr'), 'French sentence detected');
assert.ok(isProbablyTarget('Dies ändert die Konfiguration des Projekts für das neue Backend.', 'de'), 'German sentence detected');

// English prose must NEVER be detected as a Latin target (false positive =
// the line silently skips translation).
const english = [
  'This changes the project configuration to use the new backend.',
  'Use these flags to enable the cache and set a small timeout.',
  'The file was not found in the directory.',
  'I will refactor the auth module to use async tokens.',
  'Run npm install -g cctrans@latest to update.',
];
for (const line of english) {
  for (const code of ['es', 'pt', 'fr', 'de']) {
    assert.ok(!isProbablyTarget(line, code), JSON.stringify(line) + ' must not look like ' + code);
  }
}

// Short/ambiguous lines: too little evidence -> not target.
assert.ok(!isProbablyTarget('la config', 'es'), 'two words is not enough evidence');
assert.ok(!isProbablyTarget('src/de/la/path.js', 'es'), 'a path is not Spanish');

// Non-Latin targets still use the script-ratio path.
assert.ok(isProbablyTarget('这是一行中文说明文字。', 'zh-Hans'), 'Chinese ratio detection unchanged');
assert.ok(!isProbablyTarget('plain English here', 'zh-Hans'), 'English is not Chinese');

console.log('PASS: Latin targets registered; stopword detection catches real es/pt/fr/de and never flags English.');
