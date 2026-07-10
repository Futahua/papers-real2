'use strict';

// Gathering and approval binding for revising one Backpack note in place
// (current Backpack form — this is one feature's gathering path, not an
// approval framework).
//
// Everything a revision would share with the AI is gathered here, in one
// place, so the guard preview and the actual action are built from exactly
// the same material. The approval is bound to that material by a
// fingerprint over the exact content — not summaries — so if the note or
// any real source changes between preview and confirmation, the stale
// approval is refused and the creator previews again.
//
// This module never loads the AI engine: gathering and approval checking
// are reality-reading only.

const crypto = require('node:crypto');
const { checkThing, readThingContent, MAX_TEXT_BYTES } = require('./things');

const REVISION_CHANGED_ERROR =
  'The note or one of its sources changed after the preview. Review the updated sharing preview before revising.';
const REVISION_NEEDS_MATERIAL_ERROR =
  'Give a direction for this revision; this note has no recorded sources to bring up to date.';
const REVISION_NOT_AI_MADE_ERROR =
  'Only AI-made Papers notes can be revised this way.';

// Deterministic fingerprint over the exact revision material. Key order is
// fixed by construction (object literals serialize in insertion order), and
// every content field that would reach the AI is included verbatim.
function fingerprintRevisionMaterial({ roomId, artifactId, note, noteForPrompt, direction, readings }) {
  const material = {
    roomId,
    artifactId,
    title: note.title,
    body: noteForPrompt.body, // the exact (possibly capped) text that would be sent
    direction: direction || '',
    sources: readings.map(({ thing, content }) => ({
      path: thing.path,
      type: thing.type,
      status: thing.status,
      kind: content.kind ?? null,
      text: content.text ?? null, // the exact source text that would be sent
      truncated: content.truncated ?? null,
      shownBytes: content.shownBytes ?? null,
      totalBytes: content.totalBytes ?? null,
      shownEntries: content.shownEntries ?? null,
      totalEntries: content.totalEntries ?? null,
    })),
  };
  return crypto.createHash('sha256').update(JSON.stringify(material)).digest('hex');
}

// Gather everything a revision of this note would share with the AI. The
// note's recorded sources are re-read from reality as they are NOW —
// missing or unreadable sources are reported honestly, and are part of the
// fingerprint like everything else.
function gatherRevisionMaterial(store, roomId, artifactId, direction) {
  const note = store.listArtifacts(roomId).find((a) => a.id === artifactId);
  if (!note) return { error: 'That note is not in this Backpack.' };
  // The feature's boundary: revision evolves AI-made Papers notes. Anything
  // else is refused here, at the gathering path both preview and action use.
  if (note.provenance?.createdBy !== 'papers-ai') {
    return { error: REVISION_NOT_AI_MADE_ERROR };
  }
  const dir = (direction || '').trim();
  const readings = (note.provenance?.sourceThings || []).map((s) => {
    const thing = checkThing({ path: s.path, displayName: s.displayName, type: s.type });
    return { thing, content: readThingContent(thing) };
  });
  // A revision needs something to revise WITH: the creator's direction, or
  // at least one recorded source to bring the note up to date from.
  if (!dir && readings.length === 0) {
    return { error: REVISION_NEEDS_MATERIAL_ERROR };
  }
  const capped = note.body.length > MAX_TEXT_BYTES;
  const noteForPrompt = {
    title: note.title,
    body: capped
      ? note.body.slice(0, MAX_TEXT_BYTES) +
        `\n… (truncated: showing first ${MAX_TEXT_BYTES} of ${note.body.length} characters)`
      : note.body,
  };
  const fingerprint = fingerprintRevisionMaterial({
    roomId,
    artifactId,
    note,
    noteForPrompt,
    direction: dir,
    readings,
  });
  return { note, noteForPrompt, capped, readings, direction: dir, fingerprint };
}

// Does a previously approved fingerprint still match this gathering?
// A missing fingerprint never matches: no approval, no action.
function approvalMatches(gathered, fingerprint) {
  return Boolean(fingerprint) && fingerprint === gathered.fingerprint;
}

module.exports = {
  gatherRevisionMaterial,
  fingerprintRevisionMaterial,
  approvalMatches,
  REVISION_CHANGED_ERROR,
  REVISION_NEEDS_MATERIAL_ERROR,
  REVISION_NOT_AI_MADE_ERROR,
};
