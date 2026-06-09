# Roadmap

## Shipped

### ✅ Input translation — write in your language, send in English
`tt input on` enables a `UserPromptSubmit` hook: prompts that are mostly non-English get an English translation attached as `additionalContext`, which the model treats as the canonical instruction. Implementation note: Claude Code hooks provably cannot rewrite the prompt itself (verified against the 2.1.169 binary — the `UserPromptSubmit`/`UserPromptExpansion` output schemas only allow `additionalContext` and block), so attach-as-context is the strongest available form; the original prompt stays in history with the English alongside.

### ✅ Interactive setup wizard
`tt install` registers both hooks and launches the wizard; `tt setup` re-runs it anytime. Walks through target language → env-key import offer → backend selection → key entry for the chosen backend → live translation verification. Non-interactive flags: `--lang`, `--backend`, `--key`, `--import-env`, `--yes`.

### ✅ Per-tool API-key config (no env cross-pollution)
Keys live in `~/.cc-translate/keys.json` (chmod 600, atomic writes), managed via `tt key <id> [value|--clear]` and the setup wizard. Resolution order: `keys.json` → `TT_*`-prefixed env overrides (`TT_OPENAI_KEY`, `TT_DEEPL_KEY`, …) → generic env (`OPENAI_API_KEY`, …) only when opted in via `TT_USE_ENV_KEYS=1` or `useEnvKeys` in state. Generic shell keys are ignored by default, so the tool's keys and the terminal's keys cannot contaminate each other.

## Planned

- **Latin-script output targets** (e.g. English, Spanish): the current "already in target language" skip detection relies on Unicode script ranges, which can't separate Latin-script targets from English source; needs a stopword-heuristic detector. (`en` is already wired internally for the input direction.)
- **Glossary / terminology pinning**: force consistent translations for project-specific terms across all backends.
- **npm publish** as `cctranslate` (name verified available).
