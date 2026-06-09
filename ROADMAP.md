# Roadmap

Planned work, roughly in priority order. Items marked 设计要点 include implementation notes from prior research so future work doesn't re-derive them.

## 1. Input translation — write in your language, send in English
输入内容翻译为英文:快捷键把输入框里的中文(或任何语言)翻译成英文再发送。

- **Goal**: the user types a prompt in Chinese; a trigger translates it to English *before* it reaches the model — so the conversation/history stays English and skills/docs conventions hold.
- **设计要点**:
  - Claude Code `keybindings.json` provably cannot run shell commands, so a literal in-TUI hotkey is not available. Two viable triggers:
    1. **`UserPromptSubmit` hook** (can rewrite the prompt before the model sees it): auto-detect non-English input (same Unicode-script detection as `src/langs.js`) and translate to English via the configured backend. Opt-in marker (e.g. prompt ends with `;;` or starts with a space) or a `tt input on/off` state to avoid surprising rewrites.
    2. **tmux binding** that pipes the input buffer through `tt test --to en` (less integrated; fallback).
  - Must add `en` as a *target* (reverse direction) to `src/langs.js` and prompts; cache works unchanged.
  - Show the rewritten English to the user (hook can echo it) so they can verify what was actually sent.

## 2. Interactive setup wizard on install
安装时提供 setup 引导,把语言、后端、API key 等配置一步配好。

- **Goal**: `tt install` (or `tt setup`) walks through: target language → backend choice (showing which keys are already present) → API key entry (optional) → writes config → verifies with a live `tt test` → registers the hook.
- **设计要点**: plain readline prompts (no deps); re-runnable (`tt setup` standalone); non-interactive flags for scripted installs (`tt setup --lang zh-Hans --backend deepl --key ...`).

## 3. Per-tool config for API keys (no env cross-pollution)
API key 从终端环境变量改为本工具自己的 config 文件,setup 时写入,避免与其他工具互相污染。

- **Goal**: keys live in `~/.cc-translate/keys.json` (chmod 600), written by the setup wizard — not read from the shell's `OPENAI_API_KEY`/etc. by default, so this tool's keys and the terminal's keys can't contaminate each other.
- **设计要点**:
  - Resolution order: `~/.cc-translate/keys.json` → explicit `TT_*_KEY` env overrides → (optional, off by default) generic env (`OPENAI_API_KEY`...) for backward compat with a `useEnvKeys: true` config flag.
  - `tt key <backend> [value]` to set/show (masked)/clear keys; `tt backends` reads availability from the new resolution chain.
  - Never write keys into `state.json` (it's not chmod-restricted today) — separate file, 0600, atomic writes like the existing config code.

## Later / ideas
- `en` and other Latin-script targets for the *output* overlay (needs the stopword-heuristic skip detection instead of Unicode ranges).
- Glossary/terminology pinning (force consistent translations for project-specific terms).
- npm publish as `cctranslate` (name verified available).
