# Security Policy

## Supported versions

Only the **latest release** published on npm is supported with security fixes. If you
are on an older version, please upgrade (`npm install -g cctrans@latest`) and confirm
the issue reproduces before reporting.

## Reporting a vulnerability

Please use **GitHub private vulnerability reporting**: the repository's *Security*
tab → *Report a vulnerability*. If that is unavailable to you, email
**royjiangus@gmail.com**. Please do not disclose vulnerabilities in public issues.

## How cctrans handles secrets

- API keys live **only** in `~/.cc-translate/keys.json`, created with mode **0600**.
- **Environment variables are never read for keys** — `keys.json` is the single key
  source, so secrets can't leak through shell history, process listings of child
  environments, or `.env` files.
- `cctrans status` prints a key *count* and `cctrans key` prints *masked* values;
  neither ever outputs a full key, so their output is safe to paste into bug reports.

## Data at rest

Assistant output text is buffered at rest on your own machine under
`~/.cc-translate/`: the translation cache (`cache/`, sha1-keyed source→translation
pairs) and per-message section/message-mode state (`msgstate/`). Two smaller files
hold no conversation text: `stats.jsonl` (numeric usage counters plus target/backend
ids) and `last-error.json` (the last hook error for `cctrans doctor`; backend errors
may embed a snippet of the HTTP error body). Nothing is sent anywhere
except the translation backend you explicitly configured (and with the default
fallback chain, the free Google endpoint). If your conversations are sensitive,
treat `~/.cc-translate/` with the same care as your Claude Code transcripts, and
choose a backend whose data handling you trust.

## Fail-safe design

The hooks are designed so that a failure can never block or corrupt a Claude Code
session: on error, timeout (>9s), oversized output, or disabled state they emit
nothing, and Claude Code shows the original English. The overlay's `displayContent`
replaces text **on screen only** — the transcript and the model's context always keep
the original — so a compromised or misbehaving translation backend can alter what you
see, but not what the model reads or what is stored in your session history.
