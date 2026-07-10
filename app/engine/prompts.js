'use strict';

// Papers → text serialization for the AI, and parsing of what comes back.
// This file is runtime-neutral: it speaks only Papers nouns (world,
// Backpack, thing, note, conversation) and plain text. No vendor
// vocabulary. ("room" appears only as an internal identifier — see
// DOCS/PAPERS_ONTOLOGY_CLARIFICATION_V1.txt.)

// Serialize room context truthfully. Statuses come from the world store's
// freshly checked references — the AI is told what is present and what is
// missing, never a prettied-up version.
function roomContextBlock({ world, room, things, artifacts, conversation, desk }) {
  const lines = [];
  lines.push(
    "You are the AI presence inside Papers, the creator's personal world layer over their computer."
  );
  lines.push(
    `You are currently inside the Backpack "${room.title}" — a persistent Papers place in the world "${world.name}".`
  );
  lines.push('');
  if (desk && (desk.brief || desk.items.length || desk.workingNote)) {
    lines.push(
      "THE DESK — what the creator is actively working on in this Backpack right now. It is one work surface inside the Backpack, not the Backpack itself. Give this material first attention; the rest of the Backpack still counts:"
    );
    if (desk.brief) {
      lines.push(`Current brief (the creator's own words): ${desk.brief}`);
    }
    for (const item of desk.items) {
      if (item.type === 'thing') {
        lines.push(`- on the Desk: ${item.thing.displayName} — ${item.thing.type}, ${item.thing.status}, at ${item.thing.path}`);
      } else {
        lines.push(`- on the Desk: the note "${item.note.title}"`);
      }
    }
    if (desk.workingNote) {
      lines.push(`- the working note: "${desk.workingNote.title}" (the durable note you revise from this Desk)`);
    }
    lines.push('');
  }
  if (things.length) {
    lines.push("Things attached to this Backpack (references to real items on the creator's machine):");
    for (const t of things) {
      lines.push(`- ${t.displayName} — ${t.type}, ${t.status}, at ${t.path}`);
    }
  } else {
    lines.push('This Backpack has no things attached yet.');
  }
  lines.push('');
  if (artifacts.length) {
    lines.push('Notes already in this Backpack (made by you, kept by Papers):');
    for (const a of artifacts) {
      lines.push(`- "${a.title}" (created ${a.createdAt.slice(0, 10)})`);
    }
    lines.push('');
  }
  const recent = conversation.slice(-12).filter((e) => e.role !== 'status');
  if (recent.length) {
    lines.push('Recent Backpack conversation:');
    for (const e of recent) {
      lines.push(`${e.role === 'creator' ? 'Creator' : 'You'}: ${e.text}`);
    }
    lines.push('');
  }
  lines.push(
    'Ground every claim in the context above. If something is missing or was not shown to you, say so plainly instead of guessing.'
  );
  return lines.join('\n');
}

function replyPrompt(context, message) {
  return (
    roomContextBlock(context) +
    '\n\nThe creator says:\n' +
    message +
    '\n\nReply as the AI presence in this Backpack. Be concrete and grounded in the Backpack context. Plain text only. Output only the reply itself — no reasoning steps, no preamble, no meta-commentary.'
  );
}

// The guarded room-note action. `readings` pairs each selected thing with
// what was actually read from disk (including honest truncation / binary /
// unreadable markers).
function notePrompt(context, readings) {
  const parts = [roomContextBlock(context)];
  parts.push('');
  parts.push(
    'The creator asked you to write a Backpack note summarizing the following things. ' +
      'Below is what was actually read from each real item just now — truncation and unreadable content are marked honestly.'
  );
  for (const { thing, content } of readings) {
    parts.push('');
    parts.push(`=== ${thing.displayName} (${thing.type}, at ${thing.path}) ===`);
    parts.push(content.text);
  }
  parts.push('');
  parts.push(
    'Write the Backpack note now. First line must be exactly "TITLE: " followed by a short descriptive title. ' +
      'Then a blank line, then the note body in plain text. Summarize what these things are and what matters about them. ' +
      'If content was truncated, binary, or unreadable, reflect that honestly rather than pretending to know more. ' +
      'Output only the note itself — no reasoning steps, no preamble, no meta-commentary.'
  );
  return parts.join('\n');
}

// Split a note response into { title, body }. Title is null if the runtime
// did not follow the format — the caller falls back honestly.
function parseNoteResponse(text) {
  const lines = text.split('\n');
  if (lines[0] && lines[0].startsWith('TITLE:')) {
    return {
      title: lines[0].slice('TITLE:'.length).trim() || null,
      body: lines.slice(1).join('\n').trim(),
    };
  }
  return { title: null, body: text };
}

// The Desk synthesis action: turn the Backpack's active work — brief, desk
// things (read truthfully), desk notes, and the previous working note if
// one exists — into one revised working note.
function deskSynthesisPrompt(context, { readings, deskNotes, previousNote }) {
  const parts = [roomContextBlock(context)];
  parts.push('');
  parts.push(
    'The creator asked you to synthesize the Desk — this Backpack\'s active work — into the working note. ' +
      'Below is exactly what was read just now; truncation and unreadable content are marked honestly.'
  );
  if (context.desk?.brief) {
    parts.push('');
    parts.push(`=== The brief (the creator's current focus, in their words) ===`);
    parts.push(context.desk.brief);
  }
  for (const { thing, content } of readings) {
    parts.push('');
    parts.push(`=== Desk thing: ${thing.displayName} (${thing.type}, at ${thing.path}) ===`);
    parts.push(content.text);
  }
  for (const note of deskNotes) {
    parts.push('');
    parts.push(`=== Desk note: "${note.title}" ===`);
    parts.push(note.body);
  }
  if (previousNote) {
    parts.push('');
    parts.push(`=== The current working note (your previous synthesis — evolve it, do not start from scratch) ===`);
    parts.push(previousNote.body);
  }
  parts.push('');
  parts.push(
    'Write the revised working note now. First line must be exactly "TITLE: " followed by a short title for the active work. ' +
      'Then a blank line, then the note body in plain text. Cover: what this work is, its current state, what is unresolved or missing, ' +
      'and sensible next steps — grounded only in the material above. ' +
      (previousNote
        ? 'Carry forward what is still true from the previous working note and revise what has changed. '
        : '') +
      'If content was truncated, binary, or unreadable, reflect that honestly. ' +
      'Output only the note itself — no reasoning steps, no preamble, no meta-commentary.'
  );
  return parts.join('\n');
}

// Evolve an existing Backpack note in place. In this Backpack form it
// works for any AI-made note — the Desk's working note is one note this
// serves, not the owner of the action. `readings` re-reads the
// note's real sources as they are right now; `direction` is the creator's
// own instruction, if they gave one.
//
// Deliberately self-contained: unlike reply/note/Desk prompts, this one
// does NOT prepend roomContextBlock(context). Revision approval is bound to
// the exact final prompt bytes (see world/revision.js), so nothing may
// enter this prompt that was not itemized in the guard the creator
// approved — no Backpack description, Desk state, conversation, or other
// notes.
function reviseNotePrompt({ note, direction, readings }) {
  const parts = [];
  parts.push(
    `The creator asked you to revise the Backpack note "${note.title}" in place. ` +
      'It stays the same durable note — evolve it, do not start from scratch. ' +
      'Below is exactly what was read just now; truncation and unreadable content are marked honestly.'
  );
  if (direction) {
    parts.push('');
    parts.push("=== The creator's direction, in their words ===");
    parts.push(direction);
  }
  parts.push('');
  parts.push(`=== The note as it stands now: "${note.title}" ===`);
  parts.push(note.body);
  for (const { thing, content } of readings) {
    parts.push('');
    parts.push(
      `=== A source of this note, re-read from reality: ${thing.displayName} (${thing.type}, ${thing.status}, at ${thing.path}) ===`
    );
    parts.push(content.text);
  }
  parts.push('');
  parts.push(
    'Write the revised note now. First line must be exactly "TITLE: " followed by a short title — keep the current title unless the content has genuinely outgrown it. ' +
      'Then a blank line, then the note body in plain text. ' +
      (direction
        ? "Follow the creator's direction. Carry forward what is still true and revise what the direction or the re-read sources change. "
        : 'No specific direction was given: bring the note up to date with its re-read sources, carrying forward what is still true. ') +
      'If content was truncated, binary, unreadable, or missing, reflect that honestly rather than pretending to know more. ' +
      'Output only the note itself — no reasoning steps, no preamble, no meta-commentary.'
  );
  return parts.join('\n');
}

module.exports = { roomContextBlock, replyPrompt, notePrompt, deskSynthesisPrompt, reviseNotePrompt, parseNoteResponse };
