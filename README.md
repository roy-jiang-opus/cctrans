# cctranslate

**English** | [简体中文](README.zh-Hans.md) | [繁體中文](README.zh-Hant.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Русский](README.ru.md) | [हिन्दी](README.hi.md)

A **bilingual overlay** for Claude Code: every reply gets a translated line (Chinese / Japanese / Korean / Russian / Hindi) under each original English line, **right in the conversation**.

```
● I will refactor the auth module to use async tokens.
  ↳ 我将重构 auth 模块以使用异步令牌。
  This touches 3 files and adds a retry layer.
  ↳ 这涉及 3 个文件并添加重试层。
```

- **Non-destructive**: the translation only appears on screen — the transcript and the model's context **stay pure English**, so skills, docs, and code are unaffected.
- **No history pollution, no main-loop tokens**: translation runs through a **separate cheap backend**, completely outside your Claude Code session.
- **One-key toggle**: on by default; switch it off instantly when you want plain English.

## How it works

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

## Install

```bash
git clone git@github.com:roy-jiang-opus/cctranslate.git
cd cctranslate
node bin/tt.js install      # registers the hooks, links tt into ~/.local/bin, then runs the setup wizard
```

Then **restart Claude Code** (new session) so the hook loads. Send any message — replies become bilingual.

> Requires `~/.local/bin` on your PATH; otherwise use an alias:
> `alias tt='node /path/to/cctranslate/bin/tt.js'`

## Usage

| Command | What it does |
|---------|--------------|
| `tt on` / `tt off` / `tt toggle` | turn translation on / off / toggle |
| `tt status` | show state (toggle, hook, backend, language) |
| `tt lang [code]` | show/set target language: `zh-Hans` `zh-Hant` `ja` `ko` `ru` `hi` |
| `tt backend <id>` | switch translation engine |
| `tt backends` | list engines and their availability |
| `tt setup` | interactive wizard: language, backend, API keys |
| `tt key [id] [value]` | manage API keys in `~/.cc-translate/keys.json` |
| `tt input on` / `tt input off` | translate non-English input to English (sent as context) |
| `tt last [N]` | translate the latest (or N-back) reply to the terminal |
| `tt test <text>` | translate ad-hoc text to verify the engine |
| `tt install` / `tt uninstall` | register / remove the hook |

**Fastest toggle**: type `!tt off` or `!tt on` inside Claude Code's input box (`!` is CC's built-in bash mode — no model call, no tokens).

## Translation backends

| Backend | Requires | Speed | Quality | Notes |
|---------|----------|-------|---------|-------|
| `openai` (default when key present) | `tt key openai` | ~1.4s/chunk | high | `gpt-4o-mini` batched line translation, preserves code/paths |
| `anthropic` | `tt key anthropic` | ~1s/chunk | high | `claude-haiku-4-5` + structured outputs, strict same-length line arrays (~$0.0005/chunk) |
| `deepl` | `tt key deepl` (free tier: 500k chars/mo) | ~0.5s/chunk | high | best traditional MT; array API aligns lines natively |
| `azure` | `tt key azure` (free: 2M chars/mo) | ~0.5s/chunk | mid-high | optionally `tt key azure-region` |
| `google` | nothing | ~0.3s/chunk | mid | free unofficial endpoint; **the fallback when everything else fails** |
| `claude-code` | `claude` CLI logged in | ~3-6s/chunk | high | runs on your **Claude subscription** (`claude -p` headless) — zero extra cost but noticeably slower |

If the primary backend fails or times out, the chain **falls back to google** — the session is never blocked. Every translated line is cached by backend + language + content hash.

API keys live in `~/.cc-translate/keys.json` (chmod 600), set via `tt setup` or `tt key` — shell variables like `OPENAI_API_KEY` are **not** read by default, so this tool's keys and your terminal's keys can't contaminate each other. `tt setup` offers to import detected env keys; opt in to generic env reading with `TT_USE_ENV_KEYS=1`, and `TT_OPENAI_KEY`-style overrides always work.

Environment variables: `TT_BACKEND`, `TT_TARGET` (default `zh-Hans`), `TT_MARKER` (default `↳ `), `TT_HOME` (default `~/.cc-translate`), `TT_OPENAI_MODEL`, `TT_ANTHROPIC_MODEL`, `AZURE_TRANSLATOR_ENDPOINT`.

## Languages

Target languages cover **CJK + Russian + Hindi** (non-Latin scripts, so "this line is already in the target language" can be detected for free via Unicode ranges and skipped):

```bash
tt lang ja       # Japanese
tt lang ko       # Korean
tt lang ru       # Russian
tt lang hi       # Hindi
tt lang zh-Hant  # Traditional Chinese
tt lang zh-Hans  # Simplified Chinese (default)
```

Chinese uses BCP-47 **script** codes (`zh-Hans`/`zh-Hant`) — Traditional Chinese is a script, not a region; `zh-CN` / `zh-TW` are accepted as aliases and normalized. Switching takes effect immediately (the hook re-reads state on every call); each language has its own cache.

## Input translation

`tt input on` enables a `UserPromptSubmit` hook: when your prompt is mostly non-English, an English translation is attached as context the model treats as the canonical instruction — you keep typing in your language, the model works in English. (Verified on CC 2.1.169: hooks cannot rewrite the prompt itself, so the original stays in history with the English alongside.) English prompts pass through untouched; any error falls back to sending your prompt as-is.

## Behavior & limits (verified)

- The hook fires **per chunk during streaming**; each chunk is translated and replaced in place — translations appear progressively alongside the English.
- The hook has a **10-second** timeout; this tool guards at 9s internally. Any error / timeout / oversized chunk (>9,000 chars) **falls back safely to the original English** — it never stalls the session.
- Every translated line is **cached** by content hash (`~/.cc-translate/cache`); repaints and repeated text cost nothing.
- With `openai`, each chunk is roughly one API call (~$0.0001) and adds about 1s of latency vs. plain English; `google` is faster with slightly lower quality.

## Uninstall

```bash
node bin/tt.js uninstall    # removes the hook; restart Claude Code to take effect
```
