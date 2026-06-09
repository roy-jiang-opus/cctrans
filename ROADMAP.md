# Roadmap

## Shipped

### ✅ Input translation — write in your language, send in English
`tt input on` enables a `UserPromptSubmit` hook: prompts that are mostly non-English get an English translation attached as `additionalContext`, which the model treats as the canonical instruction. Implementation note: Claude Code hooks provably cannot rewrite the prompt itself (verified against the 2.1.169 **and 2.1.170** binaries — the `UserPromptSubmit`/`UserPromptExpansion` output schemas only allow `additionalContext` and block), so attach-as-context is the strongest available form; the original prompt stays in history with the English alongside. If a future CC release adds a prompt-rewrite field, switching to true replacement is a one-line change in `hook/user-prompt-submit.js`.

### ✅ Interactive setup wizard
`tt install` registers both hooks and launches the wizard; `tt setup` re-runs it anytime. Walks through target language → backend selection → key entry for the chosen backend → live translation verification. Non-interactive flags: `--lang`, `--backend`, `--key`, `--yes`.

### ✅ Per-tool API-key config (no env cross-pollution)
Keys live **only** in `~/.cc-translate/keys.json` (chmod 600, atomic writes), managed via `tt key <id> [value|--clear]`, the setup wizard, or direct file edits. Shell environment variables are **never** consulted — no overrides, no opt-in. All non-secret settings (backend, language, marker, models, Azure endpoint) live in `~/.cc-translate/state.json`. The only env vars the tool reads are internal plumbing: `TT_HOME` / `TT_TRANSCRIPT` (tests) and `TT_DISABLE` / `TT_DEBUG_STDIN` (hook internals).

## Planned

- **Latin-script output targets** (e.g. English, Spanish): the current "already in target language" skip detection relies on Unicode script ranges, which can't separate Latin-script targets from English source; needs a stopword-heuristic detector. (`en` is already wired internally for the input direction.)
- **Glossary / terminology pinning**: force consistent translations for project-specific terms across all backends.
- **npm publish** as `cctranslate` (name verified available).
