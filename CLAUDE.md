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
- `bin/tt.js` — CLI: on/off/toggle/status/lang/backend/backends/setup/key/input/install/uninstall/last/test
- `hook/message-display.js` — output overlay hook (stdin → displayContent); TT_DISABLE recursion guard
- `hook/user-prompt-submit.js` — input translation hook (non-English prompt → English additionalContext)
- `src/interleave.js` — classify lines (prose/code/target-lang/blank), build interleaved output
- `src/langs.js` — language registry (zh-Hans/zh-Hant/ja/ko/ru/hi + internal en; aliases zh-CN→zh-Hans, zh-TW→zh-Hant): names, per-backend codes, script regexes
- `src/backends/` — backend registry: openai, anthropic (Haiku + structured outputs), deepl, azure, google (free fallback), claude-code (`claude -p`, ~3-6s, uses subscription)
- `src/translate.js` — orchestrator: sha1 cache + fallback chain (primary → google)
- `src/keys.js` — API keys in `~/.cc-translate/keys.json` (0600), the ONLY key source — env vars are never read. Must NOT require config.js (config requires keys for the default backend).
- `src/setup.js` — interactive wizard (lang → key import → backend → key entry → live verify)
- `src/config.js` — state in `~/.cc-translate/state.json`, cache in `~/.cc-translate/cache`
- `src/transcript.js` — find + parse session JSONL (used by `tt last`)

## Constraints (verified, don't relitigate)
- `keybindings.json` cannot run shell commands or toggle hooks → there is no true
  in-TUI hotkey. Toggle is a flag (`tt on/off`), fastest via `!tt off` inside CC.
- MessageDisplay timeout is 10s; output cap ~10k chars. Keep per-delta work fast.
- `UserPromptSubmit`/`UserPromptExpansion` output schemas (verified on 2.1.169 AND
  2.1.170 binaries) allow only `additionalContext` + block — hooks CANNOT rewrite the
  prompt. Input translation therefore attaches the English as context; the original
  stays in history.
- No user-facing env vars: settings in state.json, secrets in keys.json. Only internal
  plumbing reads env (TT_HOME/TT_TRANSCRIPT for tests, TT_DISABLE/TT_DEBUG_STDIN in hooks).

## Testing
- `node bin/tt.js test "<text>"` — engine only.
- Live TUI: register the hook in a throwaway dir's `.claude/settings.json`, drive
  `claude --dangerously-skip-permissions` inside tmux, `capture-pane -p`. See
  `/tmp/tt-smoke/` for the smoke harness used during development.
