'use strict';

// The engine seam.
//
// Papers speaks to its AI in Papers terms: a room, the things attached to it,
// the artifacts it holds, the room conversation. Everything engine-specific
// lives inside this one file and must not leak into the world model, the
// schema, or user-facing copy.
//
// Slice 1 engine: the locally installed Claude Code CLI in print mode. Papers
// stores no engine credentials, no provider state, and no engine sessions —
// the engine's own local sign-in is reused, and the Papers world store stays
// the only custodian of continuity. If the engine is unavailable, Papers says
// so honestly instead of faking output.

const { spawn } = require('node:child_process');

const ENGINE_ID = 'claude-cli';
const TIMEOUT_MS = 240000;

function runEngine(prompt) {
  return new Promise((resolve) => {
    // The prompt travels over stdin only — the command line stays fixed.
    // On Windows the CLI is an npm .cmd shim, which needs cmd.exe to run.
    const [cmd, args] =
      process.platform === 'win32'
        ? ['cmd.exe', ['/c', 'claude', '-p', '--output-format', 'text']]
        : ['claude', ['-p', '--output-format', 'text']];
    let child;
    try {
      child = spawn(cmd, args, { windowsHide: true });
    } catch (err) {
      resolve({ ok: false, error: startFailureMessage(err.message) });
      return;
    }
    let out = '';
    let errOut = '';
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const timer = setTimeout(() => {
      try { child.kill(); } catch {}
      finish({ ok: false, error: 'The AI did not respond in time. Nothing was made up in its place.' });
    }, TIMEOUT_MS);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { errOut += d; });
    child.on('error', (err) => {
      clearTimeout(timer);
      finish({ ok: false, error: startFailureMessage(err.message) });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0 && out.trim()) {
        finish({ ok: true, text: out.trim() });
      } else {
        finish({ ok: false, error: failureMessage(code, errOut) });
      }
    });
    child.stdin.on('error', () => {});
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

function startFailureMessage(detail) {
  return (
    'The AI could not be started on this machine' +
    (detail ? ` (${detail})` : '') +
    '. Papers will not invent a reply in its place.'
  );
}

function failureMessage(code, stderrText) {
  const detail = (stderrText || '').trim();
  if (/not logged in/i.test(detail)) {
    return (
      "The AI is not signed in on this machine yet. Open a terminal, run `claude` and sign in once with `/login`, then try again. " +
      'Your room, things, and notes are unaffected — Papers keeps them itself.'
    );
  }
  return (
    'The AI failed to respond' +
    (detail ? ` (${detail.slice(0, 300)})` : ` (exit code ${code})`) +
    '. Papers will not invent a reply in its place.'
  );
}

// Serialize room context truthfully. Statuses come from the world store's
// freshly checked references — the AI is told what is present and what is
// missing, never a prettied-up version.
function roomContextBlock({ world, room, things, artifacts, conversation }) {
  const lines = [];
  lines.push(
    'You are the AI presence inside Papers, the creator\'s personal world layer over their computer.'
  );
  lines.push(
    `You are currently in the room "${room.title}" of the world "${world.name}".`
  );
  lines.push('');
  if (things.length) {
    lines.push('Things attached to this room (references to real items on the creator\'s machine):');
    for (const t of things) {
      lines.push(`- ${t.displayName} — ${t.type}, ${t.status}, at ${t.path}`);
    }
  } else {
    lines.push('This room has no things attached yet.');
  }
  lines.push('');
  if (artifacts.length) {
    lines.push('Room notes already in this room (made by you, kept by Papers):');
    for (const a of artifacts) {
      lines.push(`- "${a.title}" (created ${a.createdAt.slice(0, 10)})`);
    }
    lines.push('');
  }
  const recent = conversation.slice(-12).filter((e) => e.role !== 'status');
  if (recent.length) {
    lines.push('Recent room conversation:');
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

// Room-scoped reply: the AI answers as the presence in this room.
async function roomReply(context, message) {
  const prompt =
    roomContextBlock(context) +
    '\n\nThe creator says:\n' +
    message +
    '\n\nReply as the AI presence in this room. Be concrete and grounded in the room context. Plain text only.';
  return runEngine(prompt);
}

// The Slice 1 guarded action: summarize selected room things into a room
// note. `readings` pairs each selected thing with what was actually read
// from disk (including honest truncation / binary / unreadable markers).
async function generateRoomNote(context, readings) {
  const parts = [roomContextBlock(context)];
  parts.push('');
  parts.push(
    'The creator asked you to write a room note summarizing the following things. ' +
    'Below is what was actually read from each real item just now — truncation and unreadable content are marked honestly.'
  );
  for (const { thing, content } of readings) {
    parts.push('');
    parts.push(`=== ${thing.displayName} (${thing.type}, at ${thing.path}) ===`);
    parts.push(content.text);
  }
  parts.push('');
  parts.push(
    'Write the room note now. First line must be exactly "TITLE: " followed by a short descriptive title. ' +
    'Then a blank line, then the note body in plain text. Summarize what these things are and what matters about them. ' +
    'If content was truncated, binary, or unreadable, reflect that honestly rather than pretending to know more.'
  );
  const result = await runEngine(parts.join('\n'));
  if (!result.ok) return result;
  const lines = result.text.split('\n');
  let title = null;
  let body = result.text;
  if (lines[0] && lines[0].startsWith('TITLE:')) {
    title = lines[0].slice('TITLE:'.length).trim();
    body = lines.slice(1).join('\n').trim();
  }
  return { ok: true, title, body };
}

module.exports = { ENGINE_ID, roomReply, generateRoomNote, runEngine };
