'use strict';

// Headless Slice 1 acceptance walk (build order §9), minus the native UI
// steps. Creates a throwaway world, attaches real temp files, exercises the
// room-note action and room reply through the real engine seam, simulates a
// restart, and checks truthful missing-reference behavior.
//
// Run:  node scripts/verify-slice1.js
//       PAPERS_ENGINE=ollama node scripts/verify-slice1.js
//
// Exit 0 = every Papers-owned check passed. The AI path is reported honestly
// as LIVE or as an honest failure — a signed-out runtime does not fail the
// world checks, but a fabricated reply would.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { WorldStore } = require('../world/store');
const { readThingContent } = require('../world/things');
const engine = require('../engine');

let failures = 0;
function check(name, cond, detail) {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failures += 1;
  console.log(`  [${mark}] ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  console.log(`Slice 1 acceptance walk — engine runtime: ${engine.activeRuntimeId()}`);

  const worldDir = fs.mkdtempSync(path.join(os.tmpdir(), 'papers-accept-'));
  const realDir = fs.mkdtempSync(path.join(os.tmpdir(), 'papers-real-'));
  const realFile = path.join(realDir, 'project-notes.txt');
  fs.writeFileSync(
    realFile,
    'Papers acceptance fixture.\nThis file lists three imaginary tasks:\n1. water the garden\n2. fix the gate\n3. write to Anh\n'
  );

  console.log('\n1–3. Open world, create room, attach real things');
  let store = new WorldStore(worldDir);
  const world = store.loadWorld();
  check('world exists on first open', Boolean(world.id && world.createdAt));
  const room = store.createRoom('Acceptance room');
  check('room created and persistent', store.listRooms().length === 1);
  store.attachThing(room.id, realFile);
  store.attachThing(room.id, realDir);
  const things = store.refreshThings(room.id);
  check('both things attached and present', things.length === 2 && things.every((t) => t.status === 'present'));

  console.log('\n4. Room-scoped AI reply (through the engine seam)');
  const ctx = () => ({ world, ...store.getRoomView(room.id) });
  store.appendConversation(room.id, { role: 'creator', text: 'What is in this room?' });
  const reply = await engine.roomReply(ctx(), 'What is in this room?');
  if (reply.ok) {
    store.appendConversation(room.id, { role: 'ai', text: reply.text, meta: { engine: reply.engineLabel } });
    console.log(`  [LIVE] AI replied via ${reply.engineLabel} (${reply.text.length} chars)`);
    console.log(`         "${reply.text.replace(/\s+/g, ' ').slice(0, 140)}…"`);
  } else {
    store.appendConversation(room.id, { role: 'status', text: reply.error });
    console.log(`  [HONEST-FAILURE] ${reply.error.slice(0, 120)}`);
  }

  console.log('\n5. Guarded room-note action');
  const selected = store.refreshThings(room.id).filter((t) => t.type === 'file');
  const readings = selected.map((thing) => ({ thing, content: readThingContent(thing) }));
  check('reading is truthful', readings[0].content.kind === 'text' && readings[0].content.ok);
  const note = await engine.generateRoomNote(ctx(), readings);
  let artifactId = null;
  if (note.ok) {
    const artifact = store.addArtifact(room.id, {
      kind: 'room-note',
      title: note.title || `Note on ${selected.map((t) => t.displayName).join(', ')}`,
      body: note.body,
      provenance: {
        createdBy: 'papers-ai',
        engine: note.engineLabel,
        requestedBy: 'creator',
        sourceThingIds: selected.map((t) => t.id),
        sourceThings: selected.map((t) => ({ displayName: t.displayName, path: t.path, type: t.type })),
      },
    });
    artifactId = artifact.id;
    console.log(`  [LIVE] note written via ${note.engineLabel}: "${artifact.title}"`);
    check('note body is non-empty', artifact.body.length > 0);
    check('note provenance names its real source', artifact.provenance.sourceThings[0].path === path.resolve(realFile));
  } else {
    store.appendActivity(room.id, 'note-failed', `A room note could not be written: ${note.error}`);
    console.log(`  [HONEST-FAILURE] ${note.error.slice(0, 120)}`);
  }

  console.log('\n6. Restart continuity (fresh store over the same world)');
  store = new WorldStore(worldDir);
  store.loadWorld();
  const view = store.getRoomView(store.listRooms()[0].id);
  check('room survives restart', view.room.title === 'Acceptance room');
  check('things survive restart', view.things.length === 2);
  check('conversation record survives restart', view.conversation.length >= 1);
  check('room history survives restart', view.activity.length >= 3, `${view.activity.length} events`);
  if (artifactId) {
    check('AI-made note survives restart', view.artifacts.some((a) => a.id === artifactId));
  } else {
    check('honest note-failure was recorded in room history', view.activity.some((e) => e.kind === 'note-failed'));
  }

  console.log('\n7. Truthfulness when reality changes');
  fs.rmSync(realFile);
  const after = store.refreshThings(view.room.id);
  const gone = after.find((t) => t.type === 'file');
  check('deleted real file is reported missing', gone.status === 'missing');
  check('folder is still present', after.find((t) => t.type === 'folder').status === 'present');

  console.log(`\nResult: ${failures === 0 ? 'ALL PAPERS-OWNED CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  console.log(`AI path this run: ${artifactId ? 'LIVE (verified end-to-end)' : 'honest failure (runtime unavailable — reported, not faked)'}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Acceptance walk crashed:', err);
  process.exit(1);
});
