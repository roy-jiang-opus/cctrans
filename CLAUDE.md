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
- `bin/cctrans.js` — CLI: on/off/toggle/status/lang/mode/display/backend/backends/setup/key/input/
  install/uninstall/last/test/doctor/stats/cache/--version. `doctor` is the counterpart to the
  fail-safe design (failures are silent → doctor explains them: hook registration incl. stale
  paths, CC version >= 2.1.152, live backend probes bypassing the cache, last-error.json).
  Cache GC (size cap, state `cacheMaxMB`) runs ONLY from CLI commands (on/off daily stamp,
  `cache gc`) — never from the hook (directory sweeps must not eat the 9s delta budget).
- `hook/message-display.js` — output overlay hook (stdin → displayContent); CCTRANS_DISABLE recursion guard.
  Per-message state in `~/.cc-translate/msgstate/<message_id>.json` ({v, mode, index, inFence,
  inTable, tableBuf, buf}, atomic tmp+rename, reset at index 0 = new message OR full repaint,
  unlinked on final, 24h GC): carries the code-fence flag, the in-a-table flag + open table's raw
  rows (all modes), and the open section's buffered lines (section/message).
  Section mode commits state BEFORE translating — a crash/timeout drops a block's translation,
  never replays it at a wrong position. An index gap (a delta crashed unsaved) drops the buffer.
- `hook/ask-user-question.js` — PreToolUse + PostToolUse hook (matcher AskUserQuestion) that
  translates the interactive question dialog. The dialog renders from TOOL INPUT (MessageDisplay
  never sees it), so PreToolUse rewrites question/labels/descriptions via `updatedInput` (NO
  permissionDecision — that auto-runs the tool headless with empty answers) and stashes a restore
  map by `tool_use_id` in `~/.cc-translate/dlgmap/`; PostToolUse restores the selected answer to
  ENGLISH via `updatedToolOutput` (the model reads the option LABEL + question as its answer).
  Append = bilingual `EN\n↳ ZH` labels (EN-first survives even if restore is skipped); replace =
  pure-target labels (relies on restore). Restore needs CC >= 2.1.121 (updatedToolOutput for
  built-in tools); doctor warns below it. Verified live on CC 2.1.172 (both modes, answer reads EN).
- `src/dialog.js` — pure translateQuestions (tool_input → {updatedInput, restore map}, one batched
  translateLines call) + restoreAnswer (tool_response answers keys/values + nested echo → English;
  free-text + multi-select handled). Shared sha1 cache; no backend changes.
- `hook/user-prompt-submit.js` — input translation hook (beta): non-English prompt → English additionalContext + "respond in English" instruction. Triggers on an ABSOLUTE non-Latin char count (`inputMinChars`, default 4; `cctrans input threshold <n>`) — never a ratio (paths/identifiers dilute ratios below any threshold; measured 0.13–0.16 on typical code-mixed prompts).
- `src/interleave.js` — classify lines (prose/code/target-lang/blank), build interleaved output.
  Block markdown is split off before translation and re-applied on the translated line
  (heading → `## ↳ 译`, quote → `> ↳ 译`, list → same-width indent to avoid a second
  bullet) — translating the raw line leaves a literal `##`/`-`/`>` after the ↳ marker.
  Rendering verified live on CC 2.1.170 (heading bold on both lines, quote bar kept).
  MARKDOWN TABLES: classify tags a header-row + `|---|` delimiter + following pipe rows as
  kind `table` (threaded across deltas via `inTable`, like `inFence`); they pass through as a
  UNIT — translating a row, or splicing a ZH line between header and delimiter, breaks CommonMark
  table parsing (the splitting bug). A TRANSLATED COPY of the table (cells translated, code/
  already-target cells kept, `|---|` regenerated) is appended after it, separated by a blank line;
  the original always passes through untouched so a glitch in the copy can't break the source.
  The delta's trailing-`\n` artifact (final `''` from split) must NOT close an open table.
  Verified live on CC 2.1.172 (native box tables, EN then translated box, line + section modes).
  Also the section-mode engine (`cctrans mode section`, default `line`): `planSections`
  (pure sync segmentation — so the hook can persist state before any await) +
  `renderSections` (translate + splice). A section = a maximal prose run; boundaries are
  TEXT-anchored (real blank line / code / target line / heading / 6000-char soft cap
  deferred past list items / final), never delta-anchored — delta chunking is arbitrary
  (probe-verified: same reply, 3 deltas one run, 5 the next), and text-anchored splices
  are what make repaint replay byte-identical. Headings close their own section (a
  displaced `## ↳ 译` renders as a REAL heading below the block it titles — probe-verified);
  in displaced grouped blocks heading/quote prefixes are demoted to plain `↳` (uniform
  quote runs keep `> `). Translation stays per-LINE, so both modes share the sha1 cache
  and backend prompts are untouched. The trailing `''` from split('\n') is the delta's
  trailing-\n encoding, NOT a blank line (all non-final deltas end with \n; final never does).
  DISPLAY (`cctrans display append|replace`, default append): replace shows the translation IN
  PLACE of the English (`prefix + zh` — real bullet/heading, no ↳ marker) instead of pair()'s
  EN+↳ZH. Replace is LINE-MODE ONLY — section/message stream the English first by design and
  suppressing it would need `displayContent:""` (forbidden). Identity/failed lines keep the
  original verbatim (never blanked); code/blank/target/tables unchanged.
- `src/langs.js` — language registry (zh-Hans/zh-Hant/ja/ko/ru/hi + Latin es/pt/fr/de + internal
  en; aliases zh-CN→zh-Hans, zh-TW→zh-Hant): names, per-backend codes, token-cost `ratio` (used
  by stats), and already-target detection — `script` regex ratio for non-Latin, conservative
  stopword counting for Latin (>= 3 words, >= 2 target-stopword hits AND more than EN_STOP hits;
  false positive = silently untranslated line = expensive; false negative = re-translate, the
  identity check suppresses the echo = cheap)
- `src/stats.js` — usage journal (~/.cc-translate/stats.jsonl, O_APPEND = concurrency-safe),
  recorded by every translateLines call incl. pure cache hits; aggregation + saved-tokens
  estimate (chars/4 × (ratio−1)); compaction folds months past 2MB. `cctrans stats` reads it.
- `src/backends/` — backend registry: openai, anthropic (Haiku + structured outputs), deepl, azure, google (free fallback), claude-code (`claude -p`, ~3-6s, uses subscription)
- `src/translate.js` — orchestrator: sha1 cache + fallback chain (primary → google)
- `src/keys.js` — API keys in `~/.cc-translate/keys.json` (0600), the ONLY key source — env vars are never read. Must NOT require config.js (config requires keys for the default backend).
- `src/setup.js` — interactive wizard (lang → backend → key entry → input translation y/N → live verify); flags --lang --backend --key --input --yes
- `src/config.js` — state in `~/.cc-translate/state.json`, cache in `~/.cc-translate/cache`.
  `getState(cwd)` overlays a `.cc-translate.json` found by walking UP from cwd (hooks pass
  stdin cwd, CLI passes process.cwd()): whitelist-only overrides incl. `enabled` (per-repo
  kill switch), invalid mode ignored, broken file → global state. setState writes global only —
  project values must never leak into state.json (test/project.js locks this in).
- `src/transcript.js` — find + parse session JSONL (used by `cctrans last`)

## Constraints (verified, don't relitigate)
- MessageDisplay delta semantics (probed live on 2.1.170, raw logs in /tmp/tt-secprobe-delta):
  blank lines NEVER arrive standalone — always trailing their block in the same delta;
  a multi-sentence paragraph is ONE logical line; `displayContent:""` fully SUPPRESSES a
  delta (zero rows) — never use it: a killed hook would leave English hidden forever;
  replacing a blank line consumes the paragraph gap unless the hook re-emits the blank;
  markdown inside spliced content IS rendered (not literal); CC does NOT serialize delta
  delivery behind a slow hook. Live probes must launch claude with CCTRANS_DISABLE=1 or
  the globally-registered hook wins over the probe's.
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
  4. Move the CHANGELOG.md `Unreleased` section under the new `## [X.Y.Z] - date`
     heading (add the compare link at the bottom) in the same release commit.
- Don't `npm publish` from a local shell in CI/scripts — tokens are disallowed; local
  interactive publish with 2FA still works but the workflow is the normal path.
- GitHub's sidebar "Packages" section can't list npmjs packages (GitHub Packages
  registry only) — the npm link lives in the repo About homepage + README badges.

## Testing
- `npm test` — 10 offline deterministic suites (fence, markdown, section, latin, message,
  project, stats, table, replace, dialog): each mkdtemps a CCTRANS_HOME and pre-seeds the sha1
  cache, so NO network.
  CI runs them on push/PR (node 18/20/22/24) and before npm publish.
- `node bin/cctrans.js test "<text>"` — engine only.
- Live TUI: register the hook in a throwaway dir's `.claude/settings.json`, drive
  `claude --dangerously-skip-permissions` inside tmux, `capture-pane -p`. See
  `/tmp/tt-smoke/` for the smoke harness used during development.
