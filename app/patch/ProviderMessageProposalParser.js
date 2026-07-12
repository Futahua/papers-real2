'use strict';

// Strict parser for the papers.patch-proposal.v1 provider-message contract.
//
// The provider's final answer is UNTRUSTED DATA. Papers accepts exactly two
// shapes — one bare JSON object, or one ```json fence containing one JSON
// object with nothing before or after — and fails closed on everything else.
// No repair, no salvage, no prose tolerance. A parse failure is reported as a
// sanitized category so the UI can say why without echoing provider text.
//
// Categories: 'unexpected response format' | 'invalid JSON' | 'wrong schema'
//             | 'wrong nonce' | 'invalid diff'

const crypto = require('node:crypto');
const { PATCH_CODE, PatchError } = require('./PatchErrors');

const SCHEMA = 'papers.patch-proposal.v1';
const ALLOWED_KEYS = ['schema', 'nonce', 'summary', 'diff'];
const MAX_MESSAGE_BYTES = 512 * 1024;
const MAX_SUMMARY_CHARS = 300;
const MAX_DIFF_BYTES = 262144;

function fail(category, message) {
  const err = new PatchError(PATCH_CODE.INVALID, message);
  err.category = category;
  return err;
}

// Detect duplicate top-level keys, which JSON.parse silently collapses.
// Minimal scanner: walks the object text tracking string state and depth.
function topLevelKeys(objectText) {
  const keys = [];
  let depth = 0, inString = false, escaped = false, str = '', expectKey = false;
  for (let i = 0; i < objectText.length; i++) {
    const c = objectText[i];
    if (inString) {
      if (escaped) { escaped = false; str += c; continue; }
      if (c === '\\') { escaped = true; continue; }
      if (c === '"') { inString = false; if (depth === 1 && expectKey) { keys.push(str); expectKey = false; } continue; }
      str += c; continue;
    }
    if (c === '"') { inString = true; str = ''; continue; }
    if (c === '{') { depth++; if (depth === 1) expectKey = true; continue; }
    if (c === '[') { depth++; continue; }
    if (c === '}' || c === ']') { depth--; continue; }
    if (c === ',' && depth === 1) { expectKey = true; continue; }
    if (c === ':' && depth === 1) { expectKey = false; continue; }
  }
  return keys;
}

// parseProviderMessageProposal(finalMessageText, { nonce }) -> { summary, diff }
// Throws PatchError with .category on any deviation from the contract.
function parseProviderMessageProposal(text, opts) {
  const expectedNonce = opts && opts.nonce;
  if (!expectedNonce || typeof expectedNonce !== 'string') {
    throw fail('unexpected response format', 'No active proposal nonce.');
  }
  if (typeof text !== 'string' || text.length === 0) {
    throw fail('unexpected response format', 'Provider returned no final message text.');
  }
  if (Buffer.byteLength(text, 'utf8') > MAX_MESSAGE_BYTES) {
    throw fail('unexpected response format', 'Provider final message is oversized.');
  }
  if (text.includes('\0')) throw fail('unexpected response format', 'Provider final message contains NUL.');

  const trimmed = text.trim();
  if (trimmed.startsWith('*** Begin Patch')) {
    throw fail('unexpected response format', 'Provider returned an apply_patch envelope instead of the JSON contract.');
  }

  let objectText = null;
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    if (trimmed.includes('```')) throw fail('unexpected response format', 'Mixed JSON and fence content.');
    objectText = trimmed;
  } else {
    const fence = /^```json\r?\n([\s\S]*?)\r?\n```$/.exec(trimmed);
    if (!fence) throw fail('unexpected response format', 'Provider response is not one JSON object or one json fence.');
    const inner = fence[1].trim();
    if (inner.includes('```')) throw fail('unexpected response format', 'Nested or multiple fences.');
    if (!inner.startsWith('{') || !inner.endsWith('}')) {
      throw fail('unexpected response format', 'Fenced content is not one JSON object.');
    }
    objectText = inner;
  }

  let parsed;
  try { parsed = JSON.parse(objectText); }
  catch { throw fail('invalid JSON', 'Provider response is not valid JSON.'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw fail('invalid JSON', 'Provider response is not a JSON object.');
  }

  const seen = topLevelKeys(objectText);
  if (new Set(seen).size !== seen.length) throw fail('wrong schema', 'Duplicate JSON keys.');

  const keys = Object.keys(parsed);
  for (const k of keys) if (!ALLOWED_KEYS.includes(k)) throw fail('wrong schema', `Unknown field "${String(k).slice(0, 40)}".`);
  for (const k of ALLOWED_KEYS) if (!(k in parsed)) throw fail('wrong schema', `Missing field "${k}".`);

  if (parsed.schema !== SCHEMA) throw fail('wrong schema', 'Wrong proposal schema.');
  if (typeof parsed.nonce !== 'string' || parsed.nonce !== expectedNonce) {
    throw fail('wrong nonce', 'Proposal nonce does not match this turn.');
  }
  if (typeof parsed.summary !== 'string' || parsed.summary.length < 1 || parsed.summary.length > MAX_SUMMARY_CHARS) {
    throw fail('wrong schema', 'Summary must be a string of 1-300 characters.');
  }
  if (typeof parsed.diff !== 'string' || parsed.diff.length < 1) throw fail('invalid diff', 'Diff is empty.');
  if (Buffer.byteLength(parsed.diff, 'utf8') > MAX_DIFF_BYTES) throw fail('invalid diff', 'Diff is oversized.');
  if (parsed.diff.includes('\0')) throw fail('invalid diff', 'Diff contains NUL.');
  if (parsed.diff.includes('*** Begin Patch')) throw fail('invalid diff', 'Diff is an apply_patch envelope, not a unified Git diff.');

  // Bounded transport canonicalization — provider-message mode ONLY, and
  // only AFTER every strict check above has passed. JSON string transport
  // routinely drops the final line terminator that git requires; Papers
  // appends exactly one LF when (and only when) the nonempty diff lacks it,
  // records that it did so, and performs no other repair. Structure faults
  // (missing headers, malformed hunks, unsafe paths) still fail closed in
  // the untouched, strict validateUnifiedDiff().
  const rawProviderDiff = parsed.diff;
  let canonical = rawProviderDiff.replace(/\r\n/g, '\n');
  const terminalLfAppended = !canonical.endsWith('\n');
  if (terminalLfAppended) canonical += '\n';

  return {
    summary: parsed.summary,
    diff: canonical,
    terminalLfAppended,
    rawProviderDiffSHA256: crypto.createHash('sha256').update(rawProviderDiff, 'utf8').digest('hex'),
  };
}

// The fixed Papers-owned contract prepended to every proposal-only turn.
function buildProposalOnlyInstruction(nonce, creatorText) {
  return [
    'You are operating in Papers proposal-only mode.',
    '',
    'Do not modify files.',
    'Do not invoke a file-edit action.',
    'Do not run shell commands.',
    'Do not request execution approval.',
    'Return one patch proposal as data only.',
    '',
    'Your complete final response must be exactly one JSON object using this schema:',
    '',
    '{',
    '  "schema": "papers.patch-proposal.v1",',
    `  "nonce": "${nonce}",`,
    '  "summary": "<brief description>",',
    '  "diff": "<complete unified Git diff>"',
    '}',
    '',
    'Rules:',
    '',
    '- Echo the exact nonce supplied by Papers.',
    '- Return no prose before or after the JSON object.',
    '- Do not return an apply_patch envelope.',
    '- Do not return Markdown explanation.',
    '- The diff must use ordinary unified Git diff headers.',
    '- Each changed file in the diff MUST start with a "diff --git a/<path> b/<path>" line, followed by "--- a/<path>", "+++ b/<path>", and "@@ -<start>[,<count>] +<start>[,<count>] @@" hunk headers, exactly like `git diff` output. A diff that starts at "--- a/<path>" without the "diff --git" line will be rejected.',
    '- Example of a correctly formatted diff value (before JSON string escaping):',
    '',
    'diff --git a/example.txt b/example.txt',
    '--- a/example.txt',
    '+++ b/example.txt',
    '@@ -1 +1 @@',
    '-old line',
    '+new line',
    '',
    '- The diff string MUST end with a final newline character ("\\n" after the last changed line); git rejects a patch whose last line is unterminated.',
    '- Propose only changes required by the creator instruction.',
    '- After returning the JSON object, stop.',
    '',
    'Creator instruction:',
    creatorText,
  ].join('\n');
}

module.exports = { parseProviderMessageProposal, buildProposalOnlyInstruction, SCHEMA, MAX_DIFF_BYTES };
