# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Release notes are also published on
[GitHub Releases](https://github.com/roy-jiang-opus/cctrans/releases).

## [0.5.4] - 2026-06-11

### Added

- **`cctrans only [on|off]`** — a one-command "show only the translation, hide
  English" preset (it sets line mode + replace, the combination that fully hides
  the English). Lines that can't be translated still keep their English, and
  code blocks pass through untouched. `cctrans only off` returns to bilingual.

## [0.5.3] - 2026-06-11

### Changed

- `cctrans install` now flows straight into the settings editor after
  registering the hooks (the duplicate "Next steps" block that printed before
  the editor is gone); the onboarding reminder is shown once, after you save.

## [0.5.2] - 2026-06-11

### Added

- **`cctrans settings` — an interactive settings editor.** A clean single-screen
  page (it opens in the terminal's alternate screen, so it doesn't scroll your
  history): ↑/↓ to move, ←/→ to change a value, Enter to edit text / open
  Advanced / Save, q or Esc to save & exit. Shows the everyday settings up front
  with an **Advanced** page behind one row (marker, models, Azure endpoint, line
  spacing, input threshold, cache cap). `cctrans install` and `cctrans setup`
  now use this same editor instead of a scrolling prompt sequence.
- **Adjustable line spacing.** Two settings (in Advanced): the gap between an
  English line and its translation, and the gap between adjacent translated
  lines (e.g. list items). Defaults keep the original/translation gap smaller
  than the between-lines gap; set both to 0 for the previous tight look.

## [0.5.1] - 2026-06-11

### Changed

- **Cleaner grouped translations in section/message mode.** A list (or any
  multi-line block) now shows a blank line between the English and its
  translation and carries a single `↳` for the whole block instead of one on
  every line, with the lines aligned under it. In message mode the original
  paragraph blank lines are preserved in the translation (they used to be lost
  — and a long multi-paragraph message-mode reply could drop all but the last
  paragraph's translation; both fixed). Single-line paragraphs are unchanged.

- **Setup is now a back/forward wizard.** `cctrans setup` (and the prompts
  during `cctrans install`) let you step back with `←` to change an earlier
  answer (choices preserved) and end on a review screen where you can jump to
  edit any setting before saving — replacing the one-shot prompt sequence.
  Still zero npm dependencies; non-interactive use (flags / `--yes` / piped) is
  unchanged.

## [0.5.0] - 2026-06-10

### Added

- **Translated question dialogs.** Claude Code's interactive question dialog
  (AskUserQuestion) is now shown in your language — the question, option labels,
  and descriptions — while the model still reads English (a PreToolUse hook
  rewrites the dialog, a PostToolUse hook restores your selected answer to
  English). Append mode shows it bilingually, replace mode shows only your
  language. `cctrans dialog on|off` (on by default). **Run `cctrans install`
  after upgrading to register the new dialog hooks.** The answer-restore needs
  Claude Code >= 2.1.121; `cctrans doctor` warns on older versions.
- **Replace display mode** (`cctrans display replace`, default `append`): show only
  the translation in place of the English, instead of under it. Takes effect in
  line mode (section/message stream the English first by design). The transcript
  and model context stay English; an untranslated/identity line keeps its original
  text. Per-project overridable; setup wizard asks in line mode.
- **`cctrans mode message`** — whole reply streams in plain English, one grouped
  translation arrives at the end (alongside the existing `line` and `section`).
- **4 Latin-script target languages**: Spanish (`es`), Portuguese (`pt`), French
  (`fr`), German (`de`) — already-target detection via a conservative stopword
  heuristic instead of Unicode ranges.
- **`cctrans doctor`** — diagnoses why nothing is translating: hook registration
  (incl. stale paths from old installs), Claude Code version (MessageDisplay
  needs >= 2.1.152), backend/key state, live connectivity probes with latency,
  and the last hook error (hooks now record `~/.cc-translate/last-error.json`).
- **`cctrans stats`** — lines translated and estimated main-loop tokens saved
  (per-language token-cost ratios), with a bounded JSONL usage journal.
- **Per-project overrides** — a `.cc-translate.json` at a repo root overrides
  language/mode/display/backend (or disables the overlay) for that project only.
- **`cctrans cache [clear|gc]`** — cache size/clear, plus a 200 MB size cap
  (`cacheMaxMB`) enforced daily from CLI commands.
- **Arrow-key setup.** `cctrans setup` (and the prompts during `cctrans install`)
  are now an interactive ↑/↓ menu — pick your language, display mode, and backend
  by selecting, not typing. Still zero npm dependencies; non-interactive use
  (flags / `--yes` / piped) is unchanged.
- `cctrans status` shows the Claude Code version, node version, and any active
  project override; `cctrans install` warns when Claude Code is missing or too
  old for the MessageDisplay hook.
- CI now runs the test suite on every push/PR across Node 18/20/22/24; issue
  templates, CONTRIBUTING.md, and SECURITY.md added.

### Fixed

- **Markdown tables are no longer split/broken by the overlay.** A table's
  header, `|---|` delimiter, and rows now pass through as a unit (previously a
  translated line was spliced between the header and delimiter, destroying the
  table). A translated copy of the table is appended after it. Works in line,
  section, and message modes; table state threads across streaming deltas.
- **The end of a long reply is no longer left untranslated.** The on-screen
  string holds both the English and its translation (~2× the text), so a long
  final paragraph overflowed the old conservative size cap and reverted to
  English. The cap is raised to 16000 (Claude Code renders far more), so long
  blocks translate again.

### Changed

- The whole test suite is now fully offline and deterministic (seeded
  translation cache) — `npm test` no longer needs network access to publish.

## [0.4.2] - 2026-06-10

### Added

- `cctrans --version` (also `-v` / `version`) prints the installed version, and
  the `cctrans status` header now shows it too — one command to capture your
  full environment when reporting an issue.

### Docs

- The README update instruction is now `npm install -g cctrans@latest` (more
  reliable than `npm update -g` for global packages).

## [0.4.1] - 2026-06-10

### Docs

- New benefit-first tagline across the README (all 7 languages), the npm
  description, and the GitHub About: "Save up to 67% of your tokens: Claude
  Code in your language, billed 100% in English."
- Quick start now documents updating: `npm update -g cctrans` takes effect from
  the next reply — settings, keys, and registered hooks are untouched, no
  re-setup needed.

## [0.4.0] - 2026-06-10

### Added

- Section display mode — English block first, then its grouped `↳` translation
  (`cctrans mode section`; back anytime with `cctrans mode line`, which stays
  the default). Streaming English is never delayed; a block's translation
  appears when the block completes, and if its translation fails the English is
  simply left untranslated — the fail-safe contract is unchanged. Both modes
  share the translation cache.
- The setup wizard now asks for the display mode (non-interactive:
  `cctrans setup --mode line|section`), and `cctrans status` shows it.

### Fixed

- Headings, list items, and blockquotes no longer show a literal `##` / `-` /
  `>` after the `↳` marker: block markdown is stripped before translation and
  re-applied to the translated line (`## ↳ 译` renders as a bold heading, list
  translations indent without a second bullet, quote translations stay inside
  the quote bar).
- `cctrans test` / `cctrans last` now color **all** translated lines, including
  indented list and heading translations.

## [0.3.0] - 2026-06-10

### Added

- Input translation (beta) reworked: triggers on an absolute non-Latin
  character count with a configurable threshold
  (`cctrans input threshold <n>`), and the attached English context now
  instructs Claude to reply in English so the bilingual overlay keeps working.
  The setup wizard offers input translation as a step.
- Automated npm publishing: a GitHub Actions workflow publishes on GitHub
  Release via npm trusted publishing (OIDC) with provenance.

### Docs

- README redesigned across all 7 language versions: centered hero, features,
  quick start, follow links, plus a license section and badges.

## [0.2.1] - 2026-06-09

### Changed

- GitHub repository renamed to `cctrans`; all links updated to the new URL.
- Remaining brand strings unified to `cctrans` across the CLI and docs.

## [0.2.0] - 2026-06-09

### Added

- Multi-language support beyond Chinese: Japanese, Korean, Russian, and Hindi,
  with canonical BCP-47 script codes for Chinese (`zh-Hans`/`zh-Hant`;
  `zh-CN`/`zh-TW` accepted as aliases) and a README in every supported
  language.
- Pluggable backend registry — OpenAI, Anthropic, DeepL, Azure, Google (free,
  no key), and `claude-code` (`claude -p` on your subscription) — with a sha1
  cache and an automatic fallback chain.
- Input translation (first iteration): a `UserPromptSubmit` hook attaches an
  English translation of non-English prompts as additional context.
- Interactive setup wizard (language → backend → key entry → live
  verification) and an isolated API-key store in `~/.cc-translate/keys.json`
  (mode 0600); environment variables were removed as a configuration source
  entirely.

### Changed

- Published on npm as `cctrans` (MIT license, publish metadata, files
  whitelist); the CLI was renamed from `tt` to `cctrans`.

## [0.1.0] - 2026-06-09

### Added

- Initial release: bilingual (EN→ZH) inline overlay for Claude Code
  conversation output — a Chinese line under each English line, via the native
  `MessageDisplay` hook.
- Translation runs out-of-band (OpenAI default, free Google fallback), so it
  never pollutes the transcript or spends main-loop tokens.
- Code-fence state is threaded across streaming deltas; on any error or
  timeout the hook fails safe to the original English.

<!-- 0.1.0 and 0.2.0 predate tagging; their links use commit SHAs. -->

[0.5.4]: https://github.com/roy-jiang-opus/cctrans/compare/v0.5.3...v0.5.4
[0.5.3]: https://github.com/roy-jiang-opus/cctrans/compare/v0.5.2...v0.5.3
[0.5.2]: https://github.com/roy-jiang-opus/cctrans/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/roy-jiang-opus/cctrans/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/roy-jiang-opus/cctrans/compare/v0.4.2...v0.5.0
[0.4.2]: https://github.com/roy-jiang-opus/cctrans/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/roy-jiang-opus/cctrans/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/roy-jiang-opus/cctrans/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/roy-jiang-opus/cctrans/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/roy-jiang-opus/cctrans/compare/a62de09...v0.2.1
[0.2.0]: https://github.com/roy-jiang-opus/cctrans/compare/22910f7...a62de09
[0.1.0]: https://github.com/roy-jiang-opus/cctrans/commit/22910f7
