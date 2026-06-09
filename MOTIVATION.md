# Why this project exists — the non-English "token tax" in Claude Code

> Research notes gathered as the founding rationale for `cctranslate` / terminal-translate.
> Scope: **only the models Claude Code runs on (Claude / Anthropic)**, and the target
> languages this tool supports: **Japanese, Korean, Russian, Hindi** (plus Chinese).
> Date gathered: 2026-06-09.

## The one-sentence reason

On Claude Code, expressing the same meaning in a non-English language costs **1.5×–3× more
tokens** than English, while the model's *answer quality* in those languages stays high.
So the pain is **cost / usage-limit burn, not model competence** — and the fix is to let the
user keep working in English under the hood while reading their own language on screen.
That is exactly what this tool does (English stays in the transcript + model context; the
translated line is display-only).

## 1. Token cost — Claude's "language tax" by script

Background: among major providers, **Anthropic (Claude) has the *highest* average non-English
token tax**. Gemini (256k SentencePiece vocab) and Qwen are the most efficient; Claude uses its
own BPE tokenizer that compresses non-Latin scripts poorly. English packs ~4 chars/token; CJK
often falls back to ~1 token/char.

| Language | Script | Tokens vs English (Claude) | Notes |
|----------|--------|----------------------------|-------|
| **Japanese** 🇯🇵 | Kanji + kana (CJK) | **~2–3×** (per equivalent content) | single chars often ~1 token; per-char ~4× worse than English |
| **Korean** 🇰🇷 | Hangul (CJK, agglutinative) | **~2–3×, sometimes higher** | 3 bytes/char + agglutinative morphology → frequent char/byte-level fallback; the worst-hit CJK case |
| **Russian** 🇷🇺 | Cyrillic | **~1.5×**; narrow-domain text up to **3–4.4 tokens/word** | better than CJK but still penalized; Claude is among the less efficient closed models for Cyrillic |
| **Hindi** 🇮🇳 | Devanagari | **~2–3× and up** (penalty described as "positively comic") | low-resource + conjunct ligatures → byte-level fallback; potentially the most expensive of the four |
| Chinese (zh) | Han (CJK) | ~2–3× | included for completeness; default target of this tool |

Worked example (Korean, generalizes to the rest): `"Fix the bug in this file"` ≈ **6 tokens** in
English vs **~14–18 tokens** in Korean — same outcome.

### Why it matters specifically for Claude Code
Claude Code's **5-hour window and weekly caps are measured in tokens**, so non-English users:
- hit the weekly cap **~1.5–3× faster** (Japanese/Korean/Hindi worst, Russian mildest);
- fill the **200K / 1M context window** faster;
- pay a higher effective price for the same plan ("invisible language tax").

Anthropic's own tracking issue proposing language-adjusted limits
([claude-code #26401](https://github.com/anthropics/claude-code/issues/26401)) was closed
**"not planned" / stale** — i.e. there is no first-party remedy, which is the gap this tool fills.

## 2. Quality — this is *not* the problem

Opposite of cost: Claude is consistently strong on multilingual benchmarks, so switching the
*display* language costs nothing in answer quality (and note: quality/cost effects are
model-dependent — don't assume prompting in another language is better or cheaper).

- **MGSM** (multilingual math reasoning): Claude >90% in 8+ languages, **including Russian and Japanese**.
- **Multilingual MMLU** (knowledge): **Russian** and others slightly above 80%.
- **Opus >90% accuracy** languages explicitly include **Hindi, Japanese, Korean**.
- Roughly: Japanese ~92%, Korean/Hindi ~88–90%+, Russian >80–90%.

## 3. Four-language summary

| Dimension | Japanese | Korean | Russian | Hindi |
|-----------|----------|--------|---------|-------|
| Token cost (lower = better) | High (2–3×) | **Highest** (2–3×+) | Medium (~1.5×) | **Highest / uncertain** (2–3×+) |
| Model quality | Very strong (~92%) | Strong (~88–90%) | Strong (>80–90%) | Strong (>90% Opus) |
| Net experience | Cost-dragged | Most penalized | Best value | Most penalized |

**Design implication for this tool:** the cheapest correct UX is to keep the *session* in
English (instructions, code, transcript, model context) and translate only what the human reads
and writes — which is the non-destructive display-overlay + input-context-attach architecture
already chosen. Russian users gain the least (mild tax), Japanese/Korean/Hindi users gain the most.

## Sources

- [Claude Code Issue #26401 — CJK tokenization disadvantage, closed "not planned"](https://github.com/anthropics/claude-code/issues/26401)
- [The Hidden Token Tax on Not Speaking English to AI](https://abvx.substack.com/p/the-hidden-token-tax-on-not-speaking) — Anthropic highest non-English tax; Russian ~1.5×; Hindi penalty extreme
- [Tokenizer Quirks: Claude / GPT / Gemini don't count text the same way](https://dev.to/gabrielanhaia/tokenizer-quirks-claude-gpt-and-gemini-dont-count-the-same-text-the-same-way-1522) — CJK ≈ 1 token/char
- [Tokenization efficiency for Ukrainian / Cyrillic (Frontiers, 2025)](https://www.frontiersin.org/journals/artificial-intelligence/articles/10.3389/frai.2025.1538165/full) — Claude 3–4.4 tokens/word for Cyrillic
- [The Mystery of the Claude 3 Tokenizer — Sander Land](https://tokencontributions.substack.com/p/the-mystery-of-the-claude-3-tokenizer) — Claude tokenizer internals, CJK input/output count quirks
- [Claude 3 multilingual benchmarks — 96% across 12 languages](https://medium.com/@venugopal.adep/96-accuracy-in-12-languages-the-secret-behind-claude-3s-multilingual-mastery-699b0b2f84df)
- [Multilingual support — Claude API Docs](https://platform.claude.com/docs/en/build-with-claude/multilingual-support)
- [Mythbuster: Chinese is not more efficient than English in vibe coding (arXiv)](https://arxiv.org/html/2604.14210v1) — non-Claude models, but busts the "non-English prompts save tokens" myth
