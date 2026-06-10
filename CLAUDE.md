# terminal-translate — project notes for Claude

A bilingual (English→Chinese) inline overlay for Claude Code conversation output.
Built on the native **MessageDisplay hook**. No npm dependencies (Node ≥18 global `fetch`).

## How it works
- `hook/message-display.js` is registered as a `MessageDisplay` command hook in
  `~/.claude/settings.json`. Claude Code calls it per streaming `delta` with JSON on
  stdin: `{session_id, transcript_path, cwd, permission_mode, hook_event_name,
  turn_id, message_id, index, final, delta}`. `delta` = the newly completed line(s).
- The hook returns `{hookSpecificOutput:{hookEventName:"MessageDisplay",
  displayContent:"<EN>\n↳ <ZH>"}}`. `displayContent` **replaces the delta on screen
  only** — transcript + model context keep the original English (verified).
- Plain `\n` renders EN and ZH on separate lines (verified on CC 2.1.169). Deltas are
  **non-overlapping** (index 0,1,2…; one `final:true`), so each is translated once.
- Exit 0 with no stdout → CC shows the original delta. The hook fails safe: disabled /
  empty / error / >9s / >9000 chars → emit nothing → original English.

## Files
- `bin/cctrans.js` — CLI: on/off/toggle/status/lang/backend/backends/setup/key/input/install/uninstall/last/test
- `hook/message-display.js` — output overlay hook (stdin → displayContent); CCTRANS_DISABLE recursion guard
- `hook/user-prompt-submit.js` — input translation hook (beta): non-English prompt → English additionalContext + "respond in English" instruction. Triggers on an ABSOLUTE non-Latin char count (`inputMinChars`, default 4; `cctrans input threshold <n>`) — never a ratio (paths/identifiers dilute ratios below any threshold; measured 0.13–0.16 on typical code-mixed prompts).
- `src/interleave.js` — classify lines (prose/code/target-lang/blank), build interleaved output.
  Block markdown is split off before translation and re-applied on the translated line
  (heading → `## ↳ 译`, quote → `> ↳ 译`, list → same-width indent to avoid a second
  bullet) — translating the raw line leaves a literal `##`/`-`/`>` after the ↳ marker.
  Rendering verified live on CC 2.1.170 (heading bold on both lines, quote bar kept).
- `src/langs.js` — language registry (zh-Hans/zh-Hant/ja/ko/ru/hi + internal en; aliases zh-CN→zh-Hans, zh-TW→zh-Hant): names, per-backend codes, script regexes
- `src/backends/` — backend registry: openai, anthropic (Haiku + structured outputs), deepl, azure, google (free fallback), claude-code (`claude -p`, ~3-6s, uses subscription)
- `src/translate.js` — orchestrator: sha1 cache + fallback chain (primary → google)
- `src/keys.js` — API keys in `~/.cc-translate/keys.json` (0600), the ONLY key source — env vars are never read. Must NOT require config.js (config requires keys for the default backend).
- `src/setup.js` — interactive wizard (lang → backend → key entry → input translation y/N → live verify); flags --lang --backend --key --input --yes
- `src/config.js` — state in `~/.cc-translate/state.json`, cache in `~/.cc-translate/cache`
- `src/transcript.js` — find + parse session JSONL (used by `cctrans last`)

## Constraints (verified, don't relitigate)
- `keybindings.json` cannot run shell commands or toggle hooks → there is no true
  in-TUI hotkey. Toggle is a flag (`cctrans on/off`), fastest via `!cctrans off` inside CC.
- MessageDisplay timeout is 10s; output cap ~10k chars. Keep per-delta work fast.
- `UserPromptSubmit`/`UserPromptExpansion` output schemas (verified on 2.1.169 AND
  2.1.170 binaries) allow only `additionalContext` + block — hooks CANNOT rewrite the
  prompt. Input translation therefore attaches the English as context; the original
  stays in history.
- The input-translation additionalContext MUST instruct the model to respond in
  English (verified live via `claude -p` A/B on 2026-06-10): without it the model
  mirrors the user's language, the EN→ZH overlay never fires, and the context goes
  non-English; with it the model replies in English and the overlay renders bilingual.
- No user-facing env vars: settings in state.json, secrets in keys.json. Only internal
  plumbing reads env (CCTRANS_HOME/CCTRANS_TRANSCRIPT for tests, CCTRANS_DISABLE/CCTRANS_DEBUG_STDIN in hooks).

## Releasing
- npm publishing is automated: `.github/workflows/publish.yml` runs on GitHub Release
  published, via npm **Trusted Publisher** (OIDC, no token — npmjs settings disallow
  tokens and require 2FA; provenance is automatic). To release:
  1. `npm version patch && git push --follow-tags`
  2. Draft release notes following `.github/RELEASE_TEMPLATE.md`: summarize
     `git log vPREV..vNEW` into user-visible bullets (omit empty sections; skip
     routine README-language syncs). Don't use bare `--generate-notes` — commits
     go straight to main, so without PRs it produces only the changelog link.
  3. `gh release create vX.Y.Z --notes-file <notes.md>` — this triggers the publish.
- Don't `npm publish` from a local shell in CI/scripts — tokens are disallowed; local
  interactive publish with 2FA still works but the workflow is the normal path.
- GitHub's sidebar "Packages" section can't list npmjs packages (GitHub Packages
  registry only) — the npm link lives in the repo About homepage + README badges.

## Testing
- `node bin/cctrans.js test "<text>"` — engine only.
- Live TUI: register the hook in a throwaway dir's `.claude/settings.json`, drive
  `claude --dangerously-skip-permissions` inside tmux, `capture-pane -p`. See
  `/tmp/tt-smoke/` for the smoke harness used during development.
