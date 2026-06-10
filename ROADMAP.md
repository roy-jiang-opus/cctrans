# Roadmap

## Shipped

### ✅ Section display mode — grouped translation per block
`cctrans mode section` (default stays `line`): English streams untouched, and a block's translation is spliced in as one grouped `↳` block when the block completes (blank line / code fence / already-target line / end of message) — much quieter for list-heavy replies. Design notes: section boundaries are properties of the **text**, never of delta chunking (deltas batch arbitrarily — verified live), which makes repaint replay byte-identical; the open block buffers in `~/.cc-translate/msgstate` (atomic writes, removed on message end, 24h GC); state is committed **before** translation, so a crash/timeout can only drop a block's translation, never misplace it. Headings close their own section (a displaced `## ↳ 译` would render as a real heading). Translation stays per-line, so both modes share the sha1 cache and the backends are untouched. The boundary machinery trivially supports a future `message` granularity (flush at final only).

### ✅ Input translation — write in your language, send in English
`cctrans input on` enables a `UserPromptSubmit` hook: prompts that are mostly non-English get an English translation attached as `additionalContext`, which the model treats as the canonical instruction. Implementation note: Claude Code hooks provably cannot rewrite the prompt itself (verified against the 2.1.169 **and 2.1.170** binaries — the `UserPromptSubmit`/`UserPromptExpansion` output schemas only allow `additionalContext` and block), so attach-as-context is the strongest available form; the original prompt stays in history with the English alongside. If a future CC release adds a prompt-rewrite field, switching to true replacement is a one-line change in `hook/user-prompt-submit.js`.

### ✅ Interactive setup wizard
`cctrans install` registers both hooks and launches the wizard; `cctrans setup` re-runs it anytime. Walks through target language → display mode → backend selection → key entry for the chosen backend → live translation verification. Non-interactive flags: `--lang`, `--mode`, `--backend`, `--key`, `--yes`.

### ✅ Per-tool API-key config (no env cross-pollution)
Keys live **only** in `~/.cc-translate/keys.json` (chmod 600, atomic writes), managed via `cctrans key <id> [value|--clear]`, the setup wizard, or direct file edits. Shell environment variables are **never** consulted — no overrides, no opt-in. All non-secret settings (backend, language, marker, models, Azure endpoint) live in `~/.cc-translate/state.json`. The only env vars the tool reads are internal plumbing: `CCTRANS_HOME` / `CCTRANS_TRANSCRIPT` (tests) and `CCTRANS_DISABLE` / `CCTRANS_DEBUG_STDIN` (hook internals).

### ✅ Latin-script targets (es / pt / fr / de)
"Already in target language" can't use Unicode ranges for Latin scripts, so these use a conservative stopword heuristic (>= 2 target-stopword hits and more than the English-stopword hits) — a false positive would silently skip translation, while a false negative just re-translates and the identity check suppresses the echo. Token savings are honestly smaller here (~1.1–1.2×); the draw is the bilingual display.

### ✅ Diagnostics & self-service: doctor, stats, cache
The fail-safe design makes failures silent, so `cctrans doctor` explains them: hook registration (incl. stale paths from old installs), Claude Code version (MessageDisplay needs >= 2.1.152), backend/key state, live connectivity probes, and the last hook error (hooks record `~/.cc-translate/last-error.json`). `cctrans stats` turns the headline into the user's own number (lines translated → estimated main-loop tokens saved, per-language ratios). `cctrans cache` shows/clears the translation cache, with a 200 MB cap enforced daily from CLI commands (never from the hook).

### ✅ Whole-reply mode + per-project config
`cctrans mode message` streams the reply in plain English and appends one grouped translation at the end (the section-mode flush machinery with text boundaries suppressed). A `.cc-translate.json` at a repo root overrides language/mode/backend — or disables the overlay — for that project only; `cctrans status`/`doctor` show when an override is active.

## Planned

- **Glossary / terminology pinning**: force consistent translations for project-specific terms across all backends.
- **Input translation out of beta**: graduate `cctrans input` once enough field feedback accumulates; Latin-script input languages need the stopword detector on the input path too.
- ~~npm publish~~ → **shipped as `cctrans`** (npm's typosquat rule blocks `cctranslate` — too similar to the existing `cc-translate`).
