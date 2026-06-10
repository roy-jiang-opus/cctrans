# Contributing to cctrans

Thanks for helping out! cctrans is deliberately small: a CLI (`bin/`), two Claude Code
hooks (`hook/`), and an engine (`src/`). Most contributions land in one of those three.

## Running from source

There is no build step and nothing to install:

```bash
git clone https://github.com/roy-jiang-opus/cctrans.git
cd cctrans
node bin/cctrans.js status
node bin/cctrans.js test "The cache is content-addressed."   # engine only, no TUI needed
```

`npm link` (or `npm install -g .`) gives you the `cctrans` command on PATH, but
`node bin/cctrans.js ...` works identically.

Requires **Node >= 18** (the backends use the global `fetch`).

## Zero-dependency policy

- **No npm dependencies — runtime or dev.** `package.json` has no `dependencies` or
  `devDependencies`, and PRs that add either will be asked to remove them. Tests use
  only `node:assert` and the standard library.
- Plain CommonJS Node. No TypeScript, no transpilation, no build step.

## Tests

```bash
npm test
```

This runs seven plain-Node test files (each exits non-zero on failure):

- `test/fence.js` — code-fence state threads across streaming deltas: a code line is
  never translated even when its ` ``` ` fence arrived in an earlier delta, and prose
  still translates once the fence closes.
- `test/markdown.js` — block markdown (headings, list items, blockquotes) is stripped
  before translation and re-applied to the translated line, so the renderer never
  shows a literal `##` / `-` / `>` after the ↳ marker.
- `test/section.js` — section mode end-to-end: text-anchored section boundaries,
  cross-delta buffering, chunking invariance (repaint safety), identity suppression,
  and the hook's state-commit-before-translate path via real child processes. It is
  fully deterministic and offline: `CCTRANS_HOME` points at a temp dir and every prose
  line is pre-seeded into the sha1 cache.
- `test/latin.js` — Latin-target (es/pt/fr/de) registry + conservative stopword
  detection (English must never be flagged as already-target).
- `test/message.js` — message granularity: boundaries suppressed, one grouped block
  at final, size caps still bound the buffer.
- `test/project.js` — per-project `.cc-translate.json` overrides: walk-up search,
  precedence, invalid/broken files fail safe, global writes stay clean.
- `test/stats.js` — usage journal recording, aggregation, saved-tokens estimate,
  torn-line tolerance, compaction.

All test files are fully deterministic and offline: each one points `CCTRANS_HOME`
at a temp dir and pre-seeds the sha1 translation cache, so `npm test` never touches
the network — it runs in CI on every push/PR (Node 18/20/22/24) and gates publishing.
New tests should follow the same seeded-cache pattern.

## The README rule

The README exists in **7 languages**: `README.md` (English) plus `README.zh-Hans.md`,
`README.zh-Hant.md`, `README.ja.md`, `README.ko.md`, `README.ru.md`, and
`README.hi.md`. **Any change to README content must update all 7 files in the same
commit.** A PR that edits only `README.md` will be asked to sync the translations
before merge — machine-translating your own diff is fine; drifting files are not.

## Live TUI testing

The engine tests don't exercise real Claude Code rendering. For changes that affect
what appears on screen (markers, markdown re-application, section splicing), verify
on a live TUI — see also the "Testing" section of `CLAUDE.md`:

1. Create a throwaway directory and register the hook(s) in that directory's
   `.claude/settings.json`, so your global settings stay untouched.
2. Drive `claude --dangerously-skip-permissions` inside tmux from that directory.
3. Inspect the actual rendered output with `tmux capture-pane -p`.

**Caveat:** `CCTRANS_DISABLE=1` makes both hooks exit early and show the original
text — it's the recursion guard the `claude-code` backend sets on its `claude -p`
children. If it leaks into the shell or tmux session you're testing from, the overlay
silently never appears. Check `env | grep CCTRANS` before concluding a change is broken.

## Commits and PRs

- Run `npm test` before submitting; for rendering changes, say which Claude Code
  version you verified on live (e.g. "verified on CC 2.1.170 via tmux capture-pane").
- Keep commits focused, with an imperative subject line and a body that explains the
  user-visible behavior change.
- Don't bump the version or edit release files in a PR — releases are handled by the
  maintainer (see "Releasing" in `CLAUDE.md`).
- The "Constraints" section of `CLAUDE.md` documents behaviors that were verified
  against real Claude Code binaries (hook schemas, timeouts, keybinding limits).
  Please don't re-open those without new evidence from a newer binary.
