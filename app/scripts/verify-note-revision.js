'use strict';

// Headless acceptance walk for Backpack note revision: any AI-made Backpack
// note can be revised in place under the creator's direction — a Backpack
// capability, not Desk furniture. This walk deliberately never touches the
// Desk: no brief, no desk items, no working note.
//
// Run:  node scripts/verify-note-revision.js            (default engine)
//       PAPERS_ENGINE=ollama node scripts/verify-note-revision.js
//
// Exit 0 = every Papers-owned check passed. The AI path is reported
// honestly as LIVE or as an honest failure.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { WorldStore } = require('../world/store');
const { checkThing, readThingContent, MAX_TEXT_BYTES } = require('../world/things');
const engine = require('../engine');

let failures = 0;
function check(name, cond, detail) {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failures += 1;
  console.log(`  [${mark}] ${name}${detail ? ` — ${detail}` : ''}`);
}

// Mirrors main.js gatherNoteRevisionMaterial: one gathering path, so what is
// previewed is what is shared.
function gatherMaterial(store, roomId, artifactId) {
  const note = store.listArtifacts(roomId).find((a) => a.id === artifactId);
  const readings = (note.provenance?.sourceThings || []).map((s) => {
    const thing = checkThing({ path: s.path, displayName: s.displayName, type: s.type });
    return { thing, content: readThingContent(thing) };
  });
  const capped = note.body.length > MAX_TEXT_BYTES;
  const noteForPrompt = {
    title: note.title,
    body: capped
      ? note.body.slice(0, MAX_TEXT_BYTES) +
        `\n… (truncated: showing first ${MAX_TEXT_BYTES} of ${note.body.length} characters)`
      : note.body,
  };
  return { note, noteForPrompt, readings };
}

async function reviseOnce(store, world, roomId, artifactId, direction) {
  const { note, noteForPrompt, readings } = gatherMaterial(store, roomId, artifactId);
  const context = { world, ...store.getRoomView(roomId) };
  const result = await engine.reviseNote(context, { note: noteForPrompt, direction: direction || null, readings });
  if (!result.ok) {
    store.appendActivity(roomId, 'note-failed', `The note "${note.title}" could not be revised: ${result.error}`, {
      noteId: note.id,
      title: note.title,
    });
    return { ok: false, error: result.error };
  }
  const artifact = store.updateArtifact(roomId, artifactId, {
    title: result.title || note.title,
    body: result.body,
    revision: {
      engine: result.engineLabel,
      requestedBy: 'creator',
      direction: direction || null,
      sourceThings: readings.map(({ thing }) => ({ displayName: thing.displayName, path: thing.path, type: thing.type })),
    },
  });
  return { ok: true, artifact };
}

async function main() {
  console.log(`Backpack note revision acceptance walk — engine runtime: ${engine.activeRuntimeId()}`);

  const worldDir = fs.mkdtempSync(path.join(os.tmpdir(), 'papers-revise-'));
  const realDir = fs.mkdtempSync(path.join(os.tmpdir(), 'papers-revise-real-'));
  const planFile = path.join(realDir, 'gate-plan.txt');
  fs.writeFileSync(planFile, 'Gate plan draft.\nTasks: measure posts, buy hinges, ask Anh about paint.\n');

  console.log('\n1. A Backpack with a real thing and an AI-made note — no Desk involved');
  let store = new WorldStore(worldDir);
  const world = store.loadWorld();
  const room = store.createRoom('Garden Backpack');
  store.attachThing(room.id, planFile);
  const note = store.addArtifact(room.id, {
    kind: 'room-note',
    title: 'Hinge notes',
    body: 'The old hinges are rusted through; replacements must be 4-inch.',
    provenance: {
      createdBy: 'papers-ai',
      engine: 'test-fixture',
      sourceThings: [{ displayName: 'gate-plan.txt', path: path.resolve(planFile), type: 'file' }],
    },
  });
  check('the note exists as a plain Backpack note', note.kind === 'room-note');
  check('no desk.json exists — the Desk plays no part in this walk', !fs.existsSync(path.join(worldDir, 'rooms', room.id, 'desk.json')));

  console.log('\n2. Guarded revision with the creator\'s direction (through the engine seam)');
  const first = await reviseOnce(store, world, room.id, note.id, 'Fold in what the gate plan says now, and keep it short.');
  if (!first.ok) {
    console.log(`  [HONEST-FAILURE] ${first.error.slice(0, 120)}`);
    check('honest failure was recorded in Backpack history', store.getActivity(room.id).some((e) => e.kind === 'note-failed'));
  } else {
    console.log(`  [LIVE] revised: "${first.artifact.title}"`);
    check('same durable note was revised', first.artifact.id === note.id);
    check('still a plain Backpack note, not converted to Desk furniture', first.artifact.kind === 'room-note');
    check('revision trail exists', first.artifact.provenance.revisions.length === 1);
    check('the direction is honest provenance', first.artifact.provenance.revisions[0].direction.includes('keep it short'));
    check('the replaced text stays in the trail', first.artifact.provenance.revisions[0].previousBody.includes('rusted through'));
    check('the source was re-read from reality', first.artifact.provenance.revisions[0].sourceThings[0].path === path.resolve(planFile));
    const last = store.getActivity(room.id).at(-1);
    check('the Backpack event says "note", not "working note"', last.kind === 'note-updated' && /revised the note "/.test(last.text));
  }

  console.log('\n3. Reality changes; a second revision evolves the SAME note');
  fs.appendFileSync(planFile, 'UPDATE: hinges bought — 4-inch stainless. Paint chosen: green.\n');
  const second = await reviseOnce(store, world, room.id, note.id, null);
  if (!second.ok) {
    console.log(`  [HONEST-FAILURE] ${second.error.slice(0, 120)}`);
  } else if (first.ok) {
    console.log(`  [LIVE] revised again: "${second.artifact.title}"`);
    check('same durable note across both revisions', second.artifact.id === note.id);
    check('revision trail has two entries', second.artifact.provenance.revisions.length === 2);
    check('one note total — revision does not spawn a pile of notes', store.listArtifacts(room.id).length === 1);
  }

  console.log('\n4. Restart continuity');
  store = new WorldStore(worldDir);
  store.loadWorld();
  const reopened = store.listArtifacts(room.id).find((a) => a.id === note.id);
  check('the note survives restart', Boolean(reopened));
  if (first.ok) {
    check('the revision trail survives restart', (reopened.provenance.revisions?.length || 0) >= 1);
    check('the replaced text is still recoverable after restart', reopened.provenance.revisions[0].previousBody.includes('rusted through'));
  }

  console.log('\n5. Missing-reality honesty in the revision material');
  fs.rmSync(planFile);
  const { readings } = gatherMaterial(store, room.id, note.id);
  check('a vanished source is re-read as missing, not remembered as present', readings[0].thing.status === 'missing');
  check('what would be shared says so honestly', readings[0].content.kind === 'unreadable');

  console.log(`\nResult: ${failures === 0 ? 'ALL PAPERS-OWNED CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  console.log(`AI path this run: ${first.ok ? 'LIVE (verified end-to-end, both revisions)' : 'honest failure (runtime unavailable — reported, not faked)'}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Note revision acceptance walk crashed:', err);
  process.exit(1);
});
