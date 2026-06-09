'use strict';
// Locate and parse the active Claude Code session transcript (JSONL).
// Claude Code writes one transcript per session at:
//   ~/.claude/projects/<cwd-slug>/<sessionId>.jsonl
// where <cwd-slug> is the working dir with every non-alphanumeric char -> '-'.

const fs = require('fs');
const os = require('os');
const path = require('path');

function projectsRoot() {
  return path.join(os.homedir(), '.claude', 'projects');
}

// Replicate Claude Code's directory-slug rule for a cwd.
// e.g. /home/roy/terminal-translate -> -home-roy-terminal-translate
function slugForCwd(cwd) {
  return cwd.replace(/[^a-zA-Z0-9]/g, '-');
}

function newestJsonlIn(dir) {
  let best = null;
  let bestMtime = -1;
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch (e) {
    return null;
  }
  for (const name of entries) {
    if (!name.endsWith('.jsonl')) continue;
    const fp = path.join(dir, name);
    let st;
    try {
      st = fs.statSync(fp);
    } catch (e) {
      continue;
    }
    if (st.mtimeMs > bestMtime) {
      bestMtime = st.mtimeMs;
      best = fp;
    }
  }
  return best;
}

// Find the transcript file for the current session.
// Strategy: 1) explicit override; 2) newest .jsonl in the cwd-slug dir;
// 3) globally newest .jsonl across all projects (the active session is
//    almost always the most recently written one).
function findTranscript(cwd) {
  if (process.env.TT_TRANSCRIPT) return process.env.TT_TRANSCRIPT;

  const root = projectsRoot();
  const dir = path.join(root, slugForCwd(cwd || process.cwd()));
  const local = newestJsonlIn(dir);
  if (local) return local;

  // Fallback: scan every project dir for the globally newest transcript.
  let best = null;
  let bestMtime = -1;
  let projectDirs;
  try {
    projectDirs = fs.readdirSync(root);
  } catch (e) {
    return null;
  }
  for (const d of projectDirs) {
    const candidate = newestJsonlIn(path.join(root, d));
    if (!candidate) continue;
    const m = fs.statSync(candidate).mtimeMs;
    if (m > bestMtime) {
      bestMtime = m;
      best = candidate;
    }
  }
  return best;
}

// A "real" user prompt = something the human typed (a turn boundary),
// as opposed to a tool_result or a meta/system event.
function isRealUserPrompt(o) {
  if (!o || o.type !== 'user') return false;
  if (o.isMeta) return false;
  const c = o.message && o.message.content;
  if (typeof c === 'string') return c.trim().length > 0;
  if (Array.isArray(c)) {
    if (c.some((b) => b && b.type === 'tool_result')) return false;
    return c.some((b) => b && b.type === 'text' && b.text && b.text.trim().length > 0);
  }
  return false;
}

function readEvents(file) {
  const raw = fs.readFileSync(file, 'utf8').split('\n');
  const events = [];
  for (const ln of raw) {
    if (!ln) continue;
    try {
      events.push(JSON.parse(ln));
    } catch (e) {
      /* ignore partial/corrupt lines */
    }
  }
  return events;
}

// Indices (into events) of every real user-prompt turn boundary.
function boundaryIndices(events) {
  const out = [];
  for (let i = 0; i < events.length; i++) {
    if (isRealUserPrompt(events[i])) out.push(i);
  }
  return out;
}

// Concatenate the assistant's natural-language text (text blocks only;
// thinking + tool_use excluded) for the reply that follows a given boundary,
// up to the next boundary.
function assistantTextBetween(events, startIdx, endIdx) {
  const texts = [];
  for (let i = startIdx + 1; i < endIdx; i++) {
    const o = events[i];
    if (!o || o.type !== 'assistant') continue;
    const c = o.message && o.message.content;
    if (Array.isArray(c)) {
      for (const b of c) {
        if (b && b.type === 'text' && typeof b.text === 'string') texts.push(b.text);
      }
    } else if (typeof c === 'string') {
      texts.push(c);
    }
  }
  return texts.join('\n').trim();
}

// Extract an assistant reply. back=0 -> most recent reply, back=1 -> the one
// before it, etc. Returns { text, total, index } where index is 0-based from
// the latest.
function extractReply(file, back) {
  back = back || 0;
  const events = readEvents(file);
  const bounds = boundaryIndices(events);
  if (bounds.length === 0) {
    // No human prompt found; treat the whole file as one reply.
    return { text: assistantTextBetween(events, -1, events.length), total: 1, index: 0 };
  }
  const pick = bounds.length - 1 - back;
  if (pick < 0) return { text: '', total: bounds.length, index: back };
  const start = bounds[pick];
  const end = pick + 1 < bounds.length ? bounds[pick + 1] : events.length;
  return {
    text: assistantTextBetween(events, start, end),
    total: bounds.length,
    index: back,
  };
}

module.exports = {
  projectsRoot,
  slugForCwd,
  findTranscript,
  readEvents,
  isRealUserPrompt,
  extractReply,
};
