'use strict';

// Papers → text serialization for the AI, and parsing of what comes back.
// This file is runtime-neutral: it speaks only Papers nouns (world,
// Backpack, thing, note, conversation) and plain text. No vendor
// vocabulary. ("room" appears only as an internal identifier — see
// DOCS/PAPERS_ONTOLOGY_CLARIFICATION_V1.txt.)

// Serialize room context truthfully. Statuses come from the world store's
// freshly checked references — the AI is told what is present and what is
// missing, never a prettied-up version.
function roomContextBlock({ world, room, things, artifacts, conversation }) {
  const lines = [];
  lines.push(
    "You are the AI presence inside Papers, the creator's personal world layer over their computer."
  );
  lines.push(
    `You are currently inside the Backpack "${room.title}" — a persistent Papers place in the world "${world.name}".`
  );
  lines.push('');
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

module.exports = { roomContextBlock, replyPrompt, notePrompt, parseNoteResponse };
