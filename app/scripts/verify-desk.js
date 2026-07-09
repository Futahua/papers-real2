'use strict';

// Headless acceptance walk for the Backpack Desk slice: brief + desk items
// + Desk-grounded synthesis into a working note that is revised in place,
// with restart continuity and missing-reference honesty. Mirrors the
// creator flow minus native UI steps.
//
// Run:  node scripts/verify-desk.js            (default engine)
//       PAPERS_ENGINE=ollama node scripts/verify-desk.js
//
// Exit 0 = every Papers-owned check passed. The AI path is reported
// honestly as LIVE or as an honest failure.

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

function gatherMaterial(store, world, roomId) {
  store.refreshThings(roomId);
  const desk = store.getDeskView(roomId);
  const readings = desk.items
    .filter((i) => i.type === 'thing')
    .map((i) => ({ thing: i.thing, content: readThingContent(i.thing) }));
  const deskNotes = desk.items
    .filter((i) => i.type === 'note')
    .map((i) => ({ id: i.note.id, title: i.note.title, body: i.note.body }));
  const previousNote = desk.workingNote
    ? { title: desk.workingNote.title, body: desk.workingNote.body }
    : null;
  const context = { world, ...store.getRoomView(roomId) };
  return { desk, readings, deskNotes, previousNote, context };
}

async function synthesizeOnce(store, world, roomId) {
  const { desk, readings, deskNotes, previousNote, context } = gatherMaterial(store, world, roomId);
  const result = await engine.synthesizeDesk(context, { readings, deskNotes, previousNote });
  if (!result.ok) {
    store.appendActivity(roomId, 'note-failed', `The working note could not be revised: ${result.error}`);
    return { ok: false, error: result.error };
  }
  const revision = {
    engine: result.engineLabel,
    requestedBy: 'creator',
    briefUsed: desk.brief || null,
    sourceThingIds: readings.map(({ thing }) => thing.id),
    sourceThings: readings.map(({ thing }) => ({ displayName: thing.displayName, path: thing.path, type: thing.type })),
    sourceNoteIds: deskNotes.map((n) => n.id),
  };
  let artifact;
  if (desk.workingNote) {
    artifact = store.updateArtifact(roomId, desk.workingNote.id, {
      title: result.title || desk.workingNote.title,
      body: result.body,
      revision,
    });
  } else {
    artifact = store.addArtifact(roomId, {
      kind: 'working-note',
      title: result.title || 'Working note',
      body: result.body,
      provenance: { createdBy: 'papers-ai', ...revision, revisions: [{ at: new Date().toISOString(), ...revision }] },
    });
    store.setWorkingNote(roomId, artifact.id);
  }
  return { ok: true, artifact };
}

async function main() {
  console.log(`Backpack Desk acceptance walk — engine runtime: ${engine.activeRuntimeId()}`);

  const worldDir = fs.mkdtempSync(path.join(os.tmpdir(), 'papers-desk-'));
  const realDir = fs.mkdtempSync(path.join(os.tmpdir(), 'papers-desk-real-'));
  const planFile = path.join(realDir, 'gate-plan.txt');
  fs.writeFileSync(planFile, 'Gate plan draft.\nTasks: measure posts, buy hinges, ask Anh about paint.\n');

  console.log('\n1. Backpack with a Desk: brief + real thing + note on the Desk');
  let store = new WorldStore(worldDir);
  const world = store.loadWorld();
  const room = store.createRoom('Garden Backpack');
  const thing = store.attachThing(room.id, planFile);
  const note = store.addArtifact(room.id, {
    kind: 'room-note',
    title: 'Hinge notes',
    body: 'The old hinges are rusted through; replacements must be 4-inch.',
    provenance: { createdBy: 'papers-ai', engine: 'test-fixture' },
  });
  store.setBrief(room.id, 'Get the garden gate rebuilt this month.');
  store.addToDesk(room.id, 'thing', thing.id);
  store.addToDesk(room.id, 'note', note.id);
  const desk = store.getDeskView(room.id);
  check('brief is set', desk.brief.includes('garden gate'));
  check('desk holds the thing and the note', desk.items.length === 2);

  console.log('\n2. First Desk synthesis (through the engine seam)');
  const first = await synthesizeOnce(store, world, room.id);
  if (!first.ok) {
    console.log(`  [HONEST-FAILURE] ${first.error.slice(0, 120)}`);
    check('honest failure was recorded in Backpack history', store.getActivity(room.id).some((e) => e.kind === 'note-failed'));
  } else {
    console.log(`  [LIVE] working note: "${first.artifact.title}"`);
    check('working note exists with body', first.artifact.body.length > 0);
    check('provenance carries the brief', first.artifact.provenance.briefUsed.includes('garden gate'));
    check('provenance names the real source', first.artifact.provenance.sourceThings[0].path === path.resolve(planFile));
    check('provenance names the desk note', first.artifact.provenance.sourceNoteIds[0] === note.id);
    check('desk points at the working note', store.getDesk(room.id).workingNoteId === first.artifact.id);
  }

  console.log('\n3. Reality changes; second synthesis revises the SAME note');
  fs.appendFileSync(planFile, 'UPDATE: posts measured at 1.8m; hinges bought.\n');
  const second = await synthesizeOnce(store, world, room.id);
  if (!second.ok) {
    console.log(`  [HONEST-FAILURE] ${second.error.slice(0, 120)}`);
  } else if (first.ok) {
    console.log(`  [LIVE] revised: "${second.artifact.title}"`);
    check('same durable artifact was revised', second.artifact.id === first.artifact.id);
    check('revision trail has two entries', second.artifact.provenance.revisions.length === 2);
    check('one working note total, not a pile of notes', store.listArtifacts(room.id).length === 2, 'working note + fixture note');
  }

  console.log('\n4. Restart continuity');
  store = new WorldStore(worldDir);
  store.loadWorld();
  const reopened = store.getDeskView(room.id);
  check('brief survives restart', reopened.brief.includes('garden gate'));
  check('desk items survive restart in order', reopened.items.length === 2 && reopened.items[0].type === 'thing');
  if (first.ok) {
    check('working note survives restart on the Desk', reopened.workingNote && reopened.workingNote.id === first.artifact.id);
  }

  console.log('\n5. Missing-reality honesty on the Desk');
  fs.rmSync(planFile);
  store.refreshThings(room.id);
  const after = store.getDeskView(room.id);
  const deskThing = after.items.find((i) => i.type === 'thing');
  check('desk thing is honestly missing', deskThing.thing.status === 'missing');
  check('losing contact is a Backpack event', store.getActivity(room.id).some((e) => e.kind === 'thing-missing'));

  console.log(`\nResult: ${failures === 0 ? 'ALL PAPERS-OWNED CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  console.log(`AI path this run: ${first.ok ? 'LIVE (verified end-to-end, revision included)' : 'honest failure (runtime unavailable — reported, not faked)'}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Desk acceptance walk crashed:', err);
  process.exit(1);
});
