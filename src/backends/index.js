'use strict';
// Backend registry. Each backend implements:
//   id        - string
//   kind      - 'llm' | 'mt' | 'cli'  (informational)
//   needs     - human-readable requirement shown by `tt backends`
//   available() -> boolean            (are its prerequisites present?)
//   translate(lines, langCode, opts) -> Promise<string[]>  (same length/order)

const google = require('./google');
const openai = require('./openai');
const anthropic = require('./anthropic');
const deepl = require('./deepl');
const azure = require('./azure');
const claudeCode = require('./claude-code');

const BACKENDS = [openai, anthropic, deepl, azure, google, claudeCode];

function getBackend(id) {
  return BACKENDS.find((b) => b.id === id) || null;
}

function listBackends() {
  return BACKENDS;
}

// Fallback order when the chosen backend fails: free no-key Google last,
// preceded by whatever keyed backends are actually available.
function fallbackChain(primaryId) {
  const chain = [primaryId];
  if (primaryId !== 'google') chain.push('google');
  return chain.map(getBackend).filter(Boolean).filter((b) => b.available());
}

module.exports = { getBackend, listBackends, fallbackChain };
