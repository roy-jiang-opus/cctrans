'use strict';
// Supported target languages: CJK + Russian + Hindi (non-Latin scripts, so
// "already in target language" detection is a Unicode-range ratio) plus
// Spanish / Portuguese / French / German (Latin scripts, detected by stopword
// counting — see isProbablyTarget).
//
// Canonical codes use BCP-47 SCRIPT subtags for Chinese (zh-Hans / zh-Hant):
// Traditional Chinese is a script, not a region — zh-TW/zh-HK are kept as
// ALIASES for muscle memory and normalize to the script code.
//
// Each entry: display name (for LLM prompts), per-backend language codes,
// `ratio` (token cost vs English on Claude's tokenizer, per MOTIVATION.md —
// used by `cctrans stats` to estimate saved tokens), and either a `script`
// regex (non-Latin) or a `stop` word set (Latin) for already-target detection.

const LANGS = {
  'zh-Hans': {
    name: 'Simplified Chinese',
    google: 'zh-CN', deepl: 'ZH-HANS', azure: 'zh-Hans',
    ratio: 2.5,
    script: /[一-鿿㐀-䶿]/g, // Han
  },
  'zh-Hant': {
    name: 'Traditional Chinese',
    google: 'zh-TW', deepl: 'ZH-HANT', azure: 'zh-Hant',
    ratio: 2.5,
    script: /[一-鿿㐀-䶿]/g, // Han
  },
  ja: {
    name: 'Japanese',
    google: 'ja', deepl: 'JA', azure: 'ja',
    ratio: 2.5,
    script: /[぀-ゟ゠-ヿ一-鿿]/g, // Kana + Han
  },
  ko: {
    name: 'Korean',
    google: 'ko', deepl: 'KO', azure: 'ko',
    ratio: 2.5,
    script: /[가-힯ᄀ-ᇿ㄰-㆏]/g, // Hangul
  },
  ru: {
    name: 'Russian',
    google: 'ru', deepl: 'RU', azure: 'ru',
    ratio: 1.5,
    script: /[Ѐ-ӿ]/g, // Cyrillic
  },
  hi: {
    name: 'Hindi',
    google: 'hi', deepl: 'HI', azure: 'hi',
    ratio: 2.5,
    script: /[ऀ-ॿ]/g, // Devanagari
  },
  es: {
    name: 'Spanish',
    google: 'es', deepl: 'ES', azure: 'es',
    ratio: 1.15,
    stop: new Set(['el', 'la', 'los', 'las', 'del', 'que', 'es', 'en', 'un', 'una', 'por', 'para', 'con', 'su', 'sus', 'se', 'lo', 'como', 'más', 'pero', 'le', 'ya', 'está', 'están', 'porque', 'sí', 'sobre', 'también', 'hasta', 'donde', 'desde', 'todo', 'esta', 'este', 'cuando', 'hay', 'puede', 'muy', 'sin', 'entre', 'así', 'cada', 'usa', 'usar', 'archivo', 'archivos']),
  },
  pt: {
    name: 'Portuguese',
    google: 'pt', deepl: 'PT-BR', azure: 'pt',
    ratio: 1.15,
    stop: new Set(['os', 'de', 'do', 'da', 'dos', 'das', 'que', 'em', 'um', 'uma', 'para', 'com', 'não', 'por', 'mais', 'se', 'como', 'mas', 'foi', 'ao', 'ele', 'ela', 'são', 'está', 'estão', 'ou', 'quando', 'muito', 'já', 'também', 'só', 'pelo', 'pela', 'até', 'isso', 'entre', 'depois', 'sem', 'mesmo', 'aos', 'seus', 'sua', 'suas', 'nas', 'esse', 'essa', 'este', 'esta', 'você', 'arquivo', 'arquivos']),
  },
  fr: {
    name: 'French',
    google: 'fr', deepl: 'FR', azure: 'fr',
    ratio: 1.15,
    stop: new Set(['le', 'la', 'les', 'des', 'du', 'de', 'et', 'est', 'sont', 'dans', 'que', 'qui', 'avec', 'sur', 'pas', 'ce', 'cette', 'ces', 'une', 'un', 'au', 'aux', 'par', 'mais', 'où', 'donc', 'si', 'leur', 'votre', 'vos', 'nous', 'vous', 'ils', 'elles', 'être', 'fait', 'comme', 'tout', 'tous', 'aussi', 'très', 'peut', 'sans', 'entre', 'après', 'fichier', 'fichiers', 'utilise', 'utiliser']),
  },
  de: {
    name: 'German',
    google: 'de', deepl: 'DE', azure: 'de',
    ratio: 1.2,
    // 'um'/'am' deliberately excluded: English homographs that could pair with
    // 'die' to false-flag an English line; German prose is stopword-dense enough without them.
    stop: new Set(['der', 'die', 'das', 'und', 'ist', 'sind', 'nicht', 'mit', 'ein', 'eine', 'einen', 'einem', 'einer', 'dem', 'den', 'des', 'im', 'für', 'auf', 'sich', 'als', 'auch', 'werden', 'wird', 'wurde', 'aus', 'dass', 'sie', 'nach', 'bei', 'noch', 'wie', 'über', 'zum', 'zur', 'haben', 'hat', 'nur', 'oder', 'aber', 'vor', 'bis', 'mehr', 'durch', 'sein', 'wenn', 'datei', 'dateien', 'verwende', 'verwenden']),
  },
  en: {
    name: 'English',
    google: 'en', deepl: 'EN-US', azure: 'en',
    ratio: 1,
    script: /[A-Za-z]/g, // Latin — used by input translation (prompt -> English)
  },
};

// English stopwords, used as the comparison baseline for Latin-target
// detection: a line only counts as already-target when target stopword hits
// BEAT the English hits (a false positive silently skips translation, so the
// test must be conservative; a false negative just re-translates and the
// identity check suppresses the echo — cheap).
const EN_STOP = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'to', 'of', 'in', 'on', 'for', 'with', 'and', 'or', 'but', 'not', 'this', 'that', 'these', 'those', 'it', 'its', 'as', 'at', 'by', 'from', 'you', 'your', 'we', 'they', 'he', 'she', 'will', 'would', 'can', 'could', 'should', 'has', 'have', 'had', 'do', 'does', 'did', 'if', 'then', 'than', 'so', 'what', 'which', 'when', 'where', 'how', 'all', 'each', 'into', 'over', 'use', 'file', 'files', 'run', 'now', 'no', 'yes']);

// Combined non-Latin script regex: "is this text written in one of the
// supported non-English languages?" Used by the input-translation hook.
const NON_LATIN = /[一-鿿㐀-䶿぀-ゟ゠-ヿ가-힯ᄀ-ᇿЀ-ӿऀ-ॿ]/g;

// Absolute count, not a ratio: coding prompts are full of Latin paths and
// identifiers that would dilute any ratio below a usable threshold.
function nonLatinCount(text) {
  return (text.match(NON_LATIN) || []).length;
}

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
  // 'en' is reserved for the input-translation direction (prompt -> English);
  // it's resolvable via getLang but not advertised as an overlay target.
  return Object.keys(LANGS).filter((k) => k !== 'en');
}

// True if the line is (mostly) already written in the target language.
// Non-Latin targets: Unicode-range ratio. Latin targets: stopword counting —
// needs >= 3 words, >= 2 target-stopword hits, and more target hits than
// English hits (conservative: skipping a line that needed translation is the
// expensive mistake; re-translating an already-target line is suppressed by
// the identity check downstream).
function isProbablyTarget(line, code) {
  const lang = getLang(code);
  if (!lang) return false;
  if (lang.script) {
    const hits = (line.match(lang.script) || []).length;
    const nonspace = line.replace(/\s/g, '').length;
    return nonspace > 0 && hits / nonspace >= 0.3;
  }
  if (lang.stop) {
    const words = line.toLowerCase().match(/[\p{L}']+/gu) || [];
    if (words.length < 3) return false;
    let target = 0, english = 0;
    for (const w of words) {
      if (lang.stop.has(w)) target++;
      if (EN_STOP.has(w)) english++;
    }
    return target >= 2 && target > english;
  }
  return false;
}

module.exports = { LANGS, getLang, listLangs, isProbablyTarget, normalizeLang, nonLatinCount };
