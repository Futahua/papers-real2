'use strict';

// The engine seam — the only door between Papers and any AI runtime.
//
// Papers code calls Papers-native actions: reply in room context, write a
// room note from selected room things. Underneath, interchangeable runtime
// backends (engine/runtimes/*) implement one tiny contract:
//
//   { id, label(), complete(prompt) -> { ok, text, model? } | { ok:false, error } }
//
// No backend's vocabulary may leak past this file. Papers stores no runtime
// credentials or sessions; the Papers world store is the only custodian of
// continuity. If a runtime is unavailable, Papers says so honestly instead
// of faking output.
//
// Runtime selection is a dev-level concern, not a product surface:
//   PAPERS_ENGINE = claude-cli (default) | ollama

const prompts = require('./prompts');

const runtimes = {};
for (const rt of [require('./runtimes/claude-cli'), require('./runtimes/ollama')]) {
  runtimes[rt.id] = rt;
}

const DEFAULT_RUNTIME = 'claude-cli';

function activeRuntimeId() {
  return (process.env.PAPERS_ENGINE || '').trim() || DEFAULT_RUNTIME;
}

async function complete(prompt) {
  const id = activeRuntimeId();
  const rt = runtimes[id];
  if (!rt) {
    return {
      ok: false,
      error: `Papers is configured to use an AI runtime it does not know ("${id}"). Known runtimes: ${Object.keys(runtimes).join(', ')}. Papers will not invent a reply in its place.`,
    };
  }
  const result = await rt.complete(prompt);
  if (result.ok) {
    // Record what actually generated the text — honest provenance.
    result.engineLabel = result.model ? `${rt.id} (${result.model})` : rt.label();
  }
  return result;
}

// --- Papers-native actions -------------------------------------------------

// Room-scoped reply: the AI answers as the presence in this room.
async function roomReply(context, message) {
  return complete(prompts.replyPrompt(context, message));
}

// The guarded action: summarize selected room things into a room note.
async function generateRoomNote(context, readings) {
  const result = await complete(prompts.notePrompt(context, readings));
  if (!result.ok) return result;
  const { title, body } = prompts.parseNoteResponse(result.text);
  return { ok: true, title, body, engineLabel: result.engineLabel };
}

module.exports = { roomReply, generateRoomNote, activeRuntimeId };
