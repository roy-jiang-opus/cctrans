<!--
Release-notes template. Not consumed by any GitHub automation — the release
process (see CLAUDE.md "Releasing") drafts notes from this structure based on
`git log vPREV..vNEW`, then passes them via `gh release create --notes-file`.

Rules:
- Omit any empty section.
- One bullet per user-visible change; implementation details stay in commits.
- Mark beta features with (beta); call out breaking changes prominently.
- Keep the Full Changelog compare link as the last line.
-->

## ✨ Highlights

One or two sentences: what this release is about and why a user should upgrade.

## 🚀 New

- New feature — short user-facing description (`command to try it`)

## 🐛 Fixed

- What was broken, in user-visible terms — and what behaves differently now

## 🔧 Changed

- Behavior/CLI/config changes that aren't new features or bug fixes

## ⚠️ Breaking

- Anything requiring user action on upgrade, with the migration step

## 📚 Docs

- Notable documentation changes only (skip routine sync of the 7 README languages)

**Full Changelog**: https://github.com/roy-jiang-opus/cctrans/compare/vPREV...vNEW
