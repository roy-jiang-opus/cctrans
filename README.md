<div align="center">

# cctrans

**Save up to 67% of your tokens: Claude Code in your language, billed 100% in English.**

[![npm version](https://img.shields.io/npm/v/cctrans?color=cb3837&logo=npm)](https://www.npmjs.com/package/cctrans)
[![npm downloads](https://img.shields.io/npm/dm/cctrans?color=blue)](https://www.npmjs.com/package/cctrans)
[![GitHub stars](https://img.shields.io/github/stars/roy-jiang-opus/cctrans?style=flat&logo=github)](https://github.com/roy-jiang-opus/cctrans)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![node](https://img.shields.io/node/v/cctrans)](package.json)

**English** | [简体中文](README.zh-Hans.md) | [繁體中文](README.zh-Hant.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Русский](README.ru.md) | [हिन्दी](README.hi.md)

</div>

---

```
● I will refactor the auth module to use async tokens.
  ↳ 我将重构 auth 模块以使用异步令牌。
  This touches 3 files and adds a retry layer.
  ↳ 这涉及 3 个文件并添加重试层。
```

A **bilingual overlay** for Claude Code: a translated line (Chinese / Japanese / Korean / Russian / Hindi) under each English line, **right in the conversation** — display-only, so the transcript, the model's context, and your token bill stay 100% English.

## ✨ Features

- 🪞 **Inline bilingual display** — the translation appears under each English line, in the conversation itself, streaming along with the reply
- 🧩 **Two layouts** — per-line interleave, or `cctrans mode section`: whole English block first, then its grouped translation
- 🧾 **Non-destructive** — transcript and model context stay pure English; skills, docs, and code are untouched
- 🆓 **Zero main-loop tokens** — translation runs through a separate cheap backend (or a free one), completely outside your Claude Code session
- ⌨️ **Input translation (beta)** — type prompts in your language; the model works — and replies — in English (`cctrans input on`)
- 🌏 **6 target languages** — `zh-Hans` `zh-Hant` `ja` `ko` `ru` `hi`
- 🔌 **6 backends with auto-fallback** — OpenAI / Anthropic / DeepL / Azure / free Google / your own Claude subscription
- 🔒 **Key isolation** — API keys live only in a chmod-600 file; shell env vars are never read
- 🛟 **Fail-safe** — any error or timeout falls back to plain English; it never blocks your session

## 🚀 Quick start

```bash
npm install -g cctrans && cctrans install
```

The install registers the hooks and walks you through setup (language → display mode → backend → API key → live verification). Then **restart Claude Code** — replies become bilingual. Toggle anytime by typing `!cctrans off` / `!cctrans on` inside Claude Code (`!` is CC's built-in bash mode — no model call, no tokens).

**Already installed?** Update with `npm update -g cctrans` — it takes effect from the next reply (the hook runs fresh from disk on every chunk); your settings, keys, and registered hooks are untouched, no re-setup needed.

<details>
<summary>Install from source</summary>

```bash
git clone https://github.com/roy-jiang-opus/cctrans.git
cd cctrans
node bin/cctrans.js install
```

Requires `~/.local/bin` on your PATH, or use an alias: `alias cctrans='node /path/to/cctrans/bin/cctrans.js'`

</details>

## 🤔 Why

Two problems, one architecture:

**1. Claude Code keeps replying in English.** Skills and docs must stay English, and even with a "reply in my language" rule in CLAUDE.md, replies drift back to English. Re-asking for a translation costs a full model turn and pollutes the conversation history.

**2. Working in your language has a hidden token tax — on Claude specifically.** Expressing the same meaning costs **~1.5–3× more tokens** than English (Claude's tokenizer compresses non-Latin scripts poorly), and Claude Code's 5-hour window and weekly caps are measured in tokens — so non-English sessions burn your plan 1.5–3× faster. Crucially, **answer quality is not the problem**: Claude scores >90% on multilingual benchmarks. The pain is purely cost.

| | ja | ko | ru | hi | zh |
|---|---|---|---|---|---|
| Token cost vs English | ~2–3× | ~2–3×+ | ~1.5× | ~2–3×+ | ~2–3× |

Anthropic's tracking issue for language-adjusted limits ([#26401](https://github.com/anthropics/claude-code/issues/26401)) was closed *not planned* — there is no first-party remedy.

**So the cheapest correct design is exactly what this tool does:** the session stays English end-to-end (prompts, transcript, model context — zero extra main-loop tokens), and your language exists only where the human needs it: a display-only translated line under each English line, rendered by a separate cheap backend.

Full research notes with sources: [MOTIVATION.md](MOTIVATION.md).

## ⚙️ How it works

Built on Claude Code's native **`MessageDisplay` hook** (v2.1.152+): it fires while each assistant message renders, handing the hook each completed text chunk (`delta`); the `displayContent` the hook returns **replaces the on-screen rendering only**, never the stored message.

```
Claude streams English
        │  fires per completed chunk (stdin: turn_id/message_id/index/final/delta)
        ▼
  hook/message-display.js  ──►  src/interleave.js  ──►  src/translate.js
   (read delta, check toggle)   (prose / code / already-target)   (backends + cache)
        │
        ▼  returns displayContent = "EN line\n↳ translated line"
   Claude Code replaces the display in place (original stays in transcript/context)
```

> Verified on CC 2.1.169: deltas are **non-overlapping** completed chunks (not accumulated text), a plain `\n` renders the two languages on separate lines, and code blocks / paths / already-translated lines are skipped automatically.

## 🎛 Commands

| Command | What it does |
|---------|--------------|
| `cctrans on` / `cctrans off` / `cctrans toggle` | turn translation on / off / toggle |
| `cctrans status` | show state (toggle, hook, backend, language) |
| `cctrans lang [code]` | show/set target language: `zh-Hans` `zh-Hant` `ja` `ko` `ru` `hi` |
| `cctrans mode [line\|section]` | layout: translation under each line, or grouped per block |
| `cctrans backend <id>` | switch translation engine |
| `cctrans backends` | list engines and their availability |
| `cctrans setup` | interactive wizard: language, display mode, backend, API keys |
| `cctrans key [id] [value]` | manage API keys in `~/.cc-translate/keys.json` |
| `cctrans input on` / `cctrans input off` | **(beta)** translate non-English input to English (sent as context) |
| `cctrans input threshold <n>` | non-Latin characters that trigger input translation (default 4) |
| `cctrans last [N]` | translate the latest (or N-back) reply to the terminal |
| `cctrans test <text>` | translate ad-hoc text to verify the engine |
| `cctrans install` / `cctrans uninstall` | register / remove the hooks |

## 🧩 Display modes

`line` (default) interleaves: a translated line under each English line, streaming with the reply. `section` keeps English exactly as Claude streams it and splices in **one grouped translation when a block completes** — much quieter for list-heavy replies:

```
Use these flags:
↳ 使用以下参数：

- Enable the cache
- Set a small timeout
- Prefer the batch API
  ↳ 启用缓存
  ↳ 设置较短的超时
  ↳ 优先使用批量 API
```

```bash
cctrans mode section   # switch back anytime: cctrans mode line
```

> In section mode a block's translation appears **when the block completes**, not while it streams — with a slow backend (e.g. `claude-code`, 3–6 s/call) that pause is noticeable, so API backends feel best here. If a block's translation fails, the English is unaffected and that block simply stays untranslated.

## 🌐 Translation backends

| Backend | Requires | Speed | Quality | Notes |
|---------|----------|-------|---------|-------|
| `openai` (default when key present) | `cctrans key openai` | ~1.4s/chunk | high | `gpt-4o-mini` batched line translation, preserves code/paths |
| `anthropic` | `cctrans key anthropic` | ~1s/chunk | high | `claude-haiku-4-5` + structured outputs, strict same-length line arrays (~$0.0005/chunk) |
| `deepl` | `cctrans key deepl` (free tier: 500k chars/mo) | ~0.5s/chunk | high | best traditional MT; array API aligns lines natively |
| `azure` | `cctrans key azure` (free: 2M chars/mo) | ~0.5s/chunk | mid-high | optionally `cctrans key azure-region` |
| `google` | nothing | ~0.3s/chunk | mid | free unofficial endpoint; **the fallback when everything else fails** |
| `claude-code` | `claude` CLI logged in | ~3-6s/chunk | high | runs on your **Claude subscription** (`claude -p` headless) — zero extra cost but noticeably slower |

If the primary backend fails or times out, the chain **falls back to google** — the session is never blocked. Every translated line is cached by backend + language + content hash.

API keys live **only** in `~/.cc-translate/keys.json` (chmod 600) — set them with `cctrans setup` / `cctrans key`, or edit the file directly. Shell environment variables are never read, so this tool's keys and your terminal's keys can't contaminate each other.

All other settings (backend, language, marker, models, Azure endpoint) live in `~/.cc-translate/state.json` — change them via `cctrans` commands or edit the file directly.

## 🗣 Languages

Target languages cover **CJK + Russian + Hindi** (non-Latin scripts, so "this line is already in the target language" can be detected for free via Unicode ranges and skipped):

```bash
cctrans lang ja       # Japanese
cctrans lang ko       # Korean
cctrans lang ru       # Russian
cctrans lang hi       # Hindi
cctrans lang zh-Hant  # Traditional Chinese
cctrans lang zh-Hans  # Simplified Chinese (default)
```

Chinese uses BCP-47 **script** codes (`zh-Hans`/`zh-Hant`) — Traditional Chinese is a script, not a region; `zh-CN` / `zh-TW` are accepted as aliases and normalized. Switching takes effect immediately (the hook re-reads state on every call); each language has its own cache.

## ⌨️ Input translation (beta)

`cctrans input on` enables a `UserPromptSubmit` hook: when your prompt contains enough non-Latin text (default 4+ characters — an absolute count, so file paths and identifiers never dilute the trigger; tune with `cctrans input threshold <n>`), an English translation is attached as context the model treats as the canonical instruction, and the model is asked to **reply in English** — so the bilingual overlay keeps working and your conversation context stays English end-to-end. (Verified on CC 2.1.169: hooks cannot rewrite the prompt itself, so the original stays in history with the English alongside.) English prompts pass through untouched; any error falls back to sending your prompt as-is.

> **Beta**: the translation call blocks prompt submission for ~0.5–1.5 s per non-English prompt. Off by default; the setup wizard asks once. Feedback → [issues](https://github.com/roy-jiang-opus/cctrans/issues).

## 📏 Behavior & limits (verified)

- The hook fires **per chunk during streaming**; each chunk is translated and replaced in place — translations appear progressively alongside the English.
- The hook has a **10-second** timeout; this tool guards at 9s internally. Any error / timeout / oversized chunk (>9,000 chars) **falls back safely to the original English** — it never stalls the session.
- Every translated line is **cached** by content hash (`~/.cc-translate/cache`); repaints and repeated text cost nothing. Both modes share the cache.
- In section mode an in-flight block's text is buffered in `~/.cc-translate/msgstate` (same at-rest exposure as the cache); the file is removed when the message completes and stale ones are swept after 24h.
- With `openai`, each chunk is roughly one API call (~$0.0001) and adds about 1s of latency vs. plain English; `google` is faster with slightly lower quality.

## 🔗 Stay in the loop

- ⭐ **Star / Watch** [github.com/roy-jiang-opus/cctrans](https://github.com/roy-jiang-opus/cctrans) to get release updates
- 📦 **npm** — [npmjs.com/package/cctrans](https://www.npmjs.com/package/cctrans) · upgrade with `npm update -g cctrans`
- 🗺 **Roadmap** — [ROADMAP.md](ROADMAP.md): what's shipped, what's next
- 📚 **Research** — [MOTIVATION.md](MOTIVATION.md): the non-English token-tax data behind this project
- 🐛 **Issues / language requests** — [github.com/roy-jiang-opus/cctrans/issues](https://github.com/roy-jiang-opus/cctrans/issues)

## 📄 License

[MIT](LICENSE) © Roy Jiang
