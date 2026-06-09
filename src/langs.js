'use strict';
// Supported target languages (CJK + Russian + Hindi — non-Latin scripts only,
// so "already in target language" detection can be done by Unicode script
// ranges).
//
// Canonical codes use BCP-47 SCRIPT subtags for Chinese (zh-Hans / zh-Hant):
// Traditional Chinese is a script, not a region — zh-TW/zh-HK are kept as
// ALIASES for muscle memory and normalize to the script code.
//
// Each entry: display name (for LLM prompts), per-backend language codes, and
// a script regex used to skip lines that are already in the target language.

const LANGS = {
  'zh-Hans': {
    name: 'Simplified Chinese',
    google: 'zh-CN', deepl: 'ZH-HANS', azure: 'zh-Hans',
    script: /[一-鿿㐀-䶿]/g, // Han
  },
  'zh-Hant': {
    name: 'Traditional Chinese',
    google: 'zh-TW', deepl: 'ZH-HANT', azure: 'zh-Hant',
    script: /[一-鿿㐀-䶿]/g, // Han
  },
  ja: {
    name: 'Japanese',
    google: 'ja', deepl: 'JA', azure: 'ja',
    script: /[぀-ゟ゠-ヿ一-鿿]/g, // Kana + Han
  },
  ko: {
    name: 'Korean',
    google: 'ko', deepl: 'KO', azure: 'ko',
    script: /[가-힯ᄀ-ᇿ㄰-㆏]/g, // Hangul
  },
  ru: {
    name: 'Russian',
    google: 'ru', deepl: 'RU', azure: 'ru',
    script: /[Ѐ-ӿ]/g, // Cyrillic
  },
  hi: {
    name: 'Hindi',
    google: 'hi', deepl: 'HI', azure: 'hi',
    script: /[ऀ-ॿ]/g, // Devanagari
  },
};

// Region-code (and bare-zh) aliases -> canonical script codes.
const ALIASES = {
  zh: 'zh-Hans',
  'zh-CN': 'zh-Hans',
  'zh-SG': 'zh-Hans',
  'zh-TW': 'zh-Hant',
  'zh-HK': 'zh-Hant',
  'zh-MO': 'zh-Hant',
};

function normalizeLang(code) {
  return ALIASES[code] || code;
}

function getLang(code) {
  return LANGS[normalizeLang(code)] || null;
}

function listLangs() {
  return Object.keys(LANGS);
}

// True if the line is (mostly) already written in the target language's script.
function isProbablyTarget(line, code) {
  const lang = getLang(code);
  if (!lang) return false;
  const hits = (line.match(lang.script) || []).length;
  const nonspace = line.replace(/\s/g, '').length;
  return nonspace > 0 && hits / nonspace >= 0.3;
}

module.exports = { LANGS, getLang, listLangs, isProbablyTarget, normalizeLang };
