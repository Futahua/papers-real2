'use strict';

// Gathering and approval binding for revising one Backpack note in place
// (current Backpack form — this is one feature's gathering path, not an
// approval framework).
//
// Everything a revision would share with the AI is gathered here, in one
// place, and used to build the EXACT runtime prompt via
// engine/prompts.js's reviseNotePrompt — a deliberately self-contained
// prompt with no Backpack-wide context (no conversation, Desk state,
// other things, or other notes). The approval is bound to that exact
// prompt's bytes (sha256), not to a parallel summary of its inputs: if the
// note, direction, or any real source changes between preview and
// confirmation, the resulting prompt differs, the hash differs, and the
// stale approval is refused. The creator previews again.
//
// This module never loads the AI engine: gathering, prompt construction,
// and approval checking are reality-reading and text-building only.

const crypto = require('node:crypto');
const { checkThing, readThingContent, MAX_TEXT_BYTES } = require('./things');
const { reviseNotePrompt } = require('../engine/prompts');

const REVISION_CHANGED_ERROR =
  'The note or one of its sources changed after the preview. Review the updated sharing preview before revising.';
const REVISION_NEEDS_MATERIAL_ERROR =
  'Give a direction for this revision; this note has no recorded sources to bring up to date.';
const REVISION_NOT_AI_MADE_ERROR =
  'Only AI-made Papers notes can be revised this way.';

// Gather everything a revision of this note would share with the AI, build
// the exact runtime prompt from it, and fingerprint that exact prompt. The
// note's recorded sources are re-read from reality as they are NOW —
// missing or unreadable sources are reported honestly, and their exact
// wording is part of the prompt (and therefore the fingerprint) like
// everything else.
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
  // The one canonical prompt-construction path — preview and confirmation
  // both call this same function with the same inputs, so the string built
  // here is exactly the string sent to the runtime.
  const prompt = reviseNotePrompt({ note: noteForPrompt, direction: dir || null, readings });
  const fingerprint = crypto.createHash('sha256').update(prompt).digest('hex');
  return { note, noteForPrompt, capped, readings, direction: dir, prompt, fingerprint };
}

// Does a previously approved fingerprint still match this gathering's exact
// prompt? A missing fingerprint never matches: no approval, no action.
function approvalMatches(gathered, fingerprint) {
  return Boolean(fingerprint) && fingerprint === gathered.fingerprint;
}

module.exports = {
  gatherRevisionMaterial,
  approvalMatches,
  REVISION_CHANGED_ERROR,
  REVISION_NEEDS_MATERIAL_ERROR,
  REVISION_NOT_AI_MADE_ERROR,
};
