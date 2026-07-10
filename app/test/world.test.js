'use strict';

// Slice 1 continuity tests. A fresh WorldStore instance over the same
// directory stands in for closing and reopening Papers: everything the
// world holds must still be there, and thing statuses must track reality.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { WorldStore } = require('../world/store');
const { readThingContent, MAX_TEXT_BYTES, MAX_FOLDER_ENTRIES } = require('../world/things');

function tempDir(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `papers-${name}-`));
}

test('world is created on first open and persists across reopen', () => {
  const dir = tempDir('world');
  const store = new WorldStore(dir);
  const world = store.loadWorld();
  assert.ok(world.id.startsWith('world_'));
  assert.ok(world.createdAt);

  const reopened = new WorldStore(dir).loadWorld();
  assert.equal(reopened.id, world.id);
  assert.equal(reopened.createdAt, world.createdAt);
});

test('a room, its things, artifacts, and conversation survive restart', () => {
  const dir = tempDir('room');
  const realFile = path.join(tempDir('real'), 'notes.txt');
  fs.writeFileSync(realFile, 'the real content of a real file');
  const realFolder = tempDir('realfolder');
  fs.writeFileSync(path.join(realFolder, 'inside.txt'), 'x');

  {
    const store = new WorldStore(dir);
    store.loadWorld();
    const room = store.createRoom('Study');
    store.attachThing(room.id, realFile);
    store.attachThing(room.id, realFolder);
    store.addArtifact(room.id, {
      kind: 'room-note',
      title: 'A first note',
      body: 'Body of the note.',
      provenance: { createdBy: 'papers-ai', sourceThingIds: [] },
    });
    store.appendConversation(room.id, { role: 'creator', text: 'hello room' });
    store.appendConversation(room.id, { role: 'ai', text: 'hello creator' });
  }

  // "Restart": a brand new store over the same world directory.
  const store = new WorldStore(dir);
  store.loadWorld();
  const rooms = store.listRooms();
  assert.equal(rooms.length, 1);
  assert.equal(rooms[0].title, 'Study');
  assert.equal(rooms[0].thingCount, 2);
  assert.equal(rooms[0].artifactCount, 1);

  const view = store.getRoomView(rooms[0].id);
  assert.equal(view.things.length, 2);
  const file = view.things.find((t) => t.type === 'file');
  const folder = view.things.find((t) => t.type === 'folder');
  assert.equal(file.path, path.resolve(realFile));
  assert.equal(file.status, 'present');
  assert.equal(file.origin, 'external');
  assert.equal(folder.status, 'present');

  assert.equal(view.artifacts.length, 1);
  assert.equal(view.artifacts[0].title, 'A first note');
  assert.equal(view.artifacts[0].provenance.createdBy, 'papers-ai');

  assert.equal(view.conversation.length, 2);
  assert.equal(view.conversation[0].role, 'creator');
  assert.equal(view.conversation[1].role, 'ai');
});

test('a deleted real file is honestly reported as missing, and recovers', () => {
  const dir = tempDir('missing');
  const realDir = tempDir('real2');
  const realFile = path.join(realDir, 'volatile.txt');
  fs.writeFileSync(realFile, 'here today');

  const store = new WorldStore(dir);
  store.loadWorld();
  const room = store.createRoom('Volatile');
  const thing = store.attachThing(room.id, realFile);
  assert.equal(thing.status, 'present');

  fs.rmSync(realFile);
  let things = store.refreshThings(room.id);
  assert.equal(things[0].status, 'missing');

  // Missing status is persisted, not just computed in memory.
  const persisted = new WorldStore(dir).listThings(room.id);
  assert.equal(persisted[0].status, 'missing');

  // If reality comes back, Papers notices.
  fs.writeFileSync(realFile, 'back again');
  things = store.refreshThings(room.id);
  assert.equal(things[0].status, 'present');
});

test('attaching the same real path twice does not duplicate the reference', () => {
  const dir = tempDir('dup');
  const realDir = tempDir('real3');
  const realFile = path.join(realDir, 'once.txt');
  fs.writeFileSync(realFile, 'once');

  const store = new WorldStore(dir);
  store.loadWorld();
  const room = store.createRoom('Dedup');
  const a = store.attachThing(room.id, realFile);
  const b = store.attachThing(room.id, realFile);
  assert.equal(a.id, b.id);
  assert.equal(store.listThings(room.id).length, 1);
});

test('reading thing content is truthful about truncation and binary data', () => {
  const realDir = tempDir('content');
  const bigFile = path.join(realDir, 'big.txt');
  fs.writeFileSync(bigFile, 'a'.repeat(MAX_TEXT_BYTES + 1000));
  const binFile = path.join(realDir, 'bin.dat');
  fs.writeFileSync(binFile, Buffer.from([1, 2, 0, 4, 5]));
  const goneFile = path.join(realDir, 'gone.txt');

  const dir = tempDir('contentworld');
  const store = new WorldStore(dir);
  store.loadWorld();
  const room = store.createRoom('Content');

  const big = readThingContent(store.attachThing(room.id, bigFile));
  assert.equal(big.kind, 'text');
  assert.equal(big.truncated, true);
  assert.match(big.text, /truncated/);

  const bin = readThingContent(store.attachThing(room.id, binFile));
  assert.equal(bin.kind, 'binary');
  assert.match(bin.text, /content not included/);

  const gone = readThingContent(store.attachThing(room.id, goneFile));
  assert.equal(gone.ok, false);
  assert.equal(gone.kind, 'unreadable');

  const folder = readThingContent(store.attachThing(room.id, realDir));
  assert.equal(folder.kind, 'folder-listing');
  assert.ok(folder.totalEntries >= 2);
});

test('the room keeps its own history of what happened, and it survives restart', () => {
  const dir = tempDir('activity');
  const realDir = tempDir('real4');
  const realFile = path.join(realDir, 'seen.txt');
  fs.writeFileSync(realFile, 'seen');

  {
    const store = new WorldStore(dir);
    store.loadWorld();
    const room = store.createRoom('Lived-in');
    const thing = store.attachThing(room.id, realFile);
    store.renameRoom(room.id, 'Lived-in properly');
    store.renameRoom(room.id, 'Lived-in properly'); // no-op rename: no event
    store.detachThing(room.id, thing.id);
    store.addArtifact(room.id, {
      kind: 'room-note',
      title: 'History note',
      body: '…',
      provenance: { createdBy: 'papers-ai', sourceThings: [{ displayName: 'seen.txt' }] },
    });
  }

  const store = new WorldStore(dir);
  store.loadWorld();
  const roomId = store.listRooms()[0].id;
  const activity = store.getActivity(roomId);
  const kinds = activity.map((e) => e.kind);
  assert.deepEqual(kinds, [
    'room-created',
    'thing-attached',
    'room-renamed',
    'thing-detached',
    'note-created',
  ]);
  assert.match(activity[1].text, /seen\.txt/);
  assert.match(activity[3].text, /not touched/);
  assert.match(activity[4].text, /History note/);
  for (const e of activity) {
    assert.ok(e.at, 'every event is timestamped');
    assert.ok(e.id.startsWith('event_'));
  }
});

test('a room remembers the previous visit so "since your last visit" is honest', () => {
  const dir = tempDir('visits');
  const store = new WorldStore(dir);
  store.loadWorld();
  const room = store.createRoom('Revisited');
  const firstEntry = store.markRoomEntered(room.id);
  const secondEntry = store.markRoomEntered(room.id);
  assert.equal(secondEntry.previousEnteredAt, firstEntry.lastEnteredAt);
  // Persisted, not just in memory.
  const reloaded = new WorldStore(dir).getRoomRecord(room.id);
  assert.equal(reloaded.previousEnteredAt, firstEntry.lastEnteredAt);
});

test('the room description is durable room state with an honest trail', () => {
  const dir = tempDir('desc');
  {
    const store = new WorldStore(dir);
    store.loadWorld();
    const room = store.createRoom('Described');
    store.setRoomDescription(room.id, 'Where the garden plans live.');
    store.setRoomDescription(room.id, 'Where the garden plans live.'); // no-op: no event
  }
  const store = new WorldStore(dir);
  store.loadWorld();
  const room = store.listRooms()[0];
  assert.equal(room.description, 'Where the garden plans live.');
  assert.ok(room.descriptionUpdatedAt);
  const described = store.getActivity(room.id).filter((e) => e.kind === 'room-described');
  assert.equal(described.length, 1, 'a no-op description save logs nothing');
  store.setRoomDescription(room.id, '');
  assert.equal(store.getRoomRecord(room.id).description, '');
  assert.match(store.getActivity(room.id).at(-1).text, /cleared/);
});

test('pinning a note is durable, event-logged, and idempotent', () => {
  const dir = tempDir('pin');
  const store = new WorldStore(dir);
  store.loadWorld();
  const room = store.createRoom('Pinboard');
  const a = store.addArtifact(room.id, { kind: 'room-note', title: 'Keep me', body: '…', provenance: {} });
  store.setArtifactPinned(room.id, a.id, true);
  store.setArtifactPinned(room.id, a.id, true); // idempotent: no second event
  const pinned = new WorldStore(dir).listArtifacts(room.id)[0];
  assert.equal(pinned.pinned, true);
  assert.ok(pinned.pinnedAt);
  const pinEvents = store.getActivity(room.id).filter((e) => e.kind === 'note-pinned');
  assert.equal(pinEvents.length, 1);
  store.setArtifactPinned(room.id, a.id, false);
  const unpinned = store.listArtifacts(room.id)[0];
  assert.equal(unpinned.pinned, false);
  assert.equal(unpinned.pinnedAt, null);
  assert.match(store.getActivity(room.id).at(-1).text, /unpinned/);
});

test('the world view surfaces each room\'s last activity and missing count', () => {
  const dir = tempDir('worldcards');
  const realDir = tempDir('real5');
  const realFile = path.join(realDir, 'gone-soon.txt');
  fs.writeFileSync(realFile, 'x');

  const store = new WorldStore(dir);
  store.loadWorld();
  const room = store.createRoom('Surfaced');
  store.attachThing(room.id, realFile);
  fs.rmSync(realFile);
  store.refreshThings(room.id);

  const card = store.listRooms()[0];
  assert.equal(card.missingCount, 1);
  assert.ok(card.lastActivity);
  assert.match(card.lastActivity.text, /gone-soon\.txt/);
  assert.ok(card.lastActivity.at);
});

test('room events carry refs to the objects they are about, durably', () => {
  const dir = tempDir('refs');
  const realDir = tempDir('real6');
  const realFile = path.join(realDir, 'referred.txt');
  fs.writeFileSync(realFile, 'x');

  let noteId;
  {
    const store = new WorldStore(dir);
    store.loadWorld();
    const room = store.createRoom('Referenced');
    const thing = store.attachThing(room.id, realFile);
    const note = store.addArtifact(room.id, { kind: 'room-note', title: 'Ref note', body: '…', provenance: {} });
    noteId = note.id;
    store.setArtifactPinned(room.id, note.id, true);
    store.detachThing(room.id, thing.id);
  }

  const store = new WorldStore(dir);
  store.loadWorld();
  const roomId = store.listRooms()[0].id;
  const byKind = Object.fromEntries(store.getActivity(roomId).map((e) => [e.kind, e]));
  assert.equal(byKind['thing-attached'].refs.path, path.resolve(realFile));
  assert.equal(byKind['thing-attached'].refs.displayName, 'referred.txt');
  assert.equal(byKind['thing-detached'].refs.path, path.resolve(realFile));
  assert.equal(byKind['note-created'].refs.noteId, noteId);
  assert.equal(byKind['note-pinned'].refs.noteId, noteId);
  assert.equal(byKind['room-created'].refs, undefined, 'events without objects carry no refs');
});

test('losing and regaining contact with a real thing are room events, logged once', () => {
  const dir = tempDir('transitions');
  const realDir = tempDir('real7');
  const realFile = path.join(realDir, 'flicker.txt');
  fs.writeFileSync(realFile, 'x');

  const store = new WorldStore(dir);
  store.loadWorld();
  const room = store.createRoom('Flicker');
  store.attachThing(room.id, realFile);

  fs.rmSync(realFile);
  store.refreshThings(room.id);
  store.refreshThings(room.id); // unchanged status: no duplicate event
  let kinds = store.getActivity(room.id).map((e) => e.kind);
  assert.equal(kinds.filter((k) => k === 'thing-missing').length, 1);
  const missingEvent = store.getActivity(room.id).find((e) => e.kind === 'thing-missing');
  assert.equal(missingEvent.refs.path, path.resolve(realFile));
  assert.match(missingEvent.text, /Lost contact/);

  fs.writeFileSync(realFile, 'back');
  store.refreshThings(room.id);
  store.refreshThings(room.id);
  kinds = store.getActivity(room.id).map((e) => e.kind);
  assert.equal(kinds.filter((k) => k === 'thing-recovered').length, 1);
  assert.match(store.getActivity(room.id).find((e) => e.kind === 'thing-recovered').text, /is back/);
});

test('the Desk — brief, items, working note — survives restart in order', () => {
  const dir = tempDir('desk');
  const realDir = tempDir('real8');
  const fileA = path.join(realDir, 'a.txt');
  const fileB = path.join(realDir, 'b.txt');
  fs.writeFileSync(fileA, 'a');
  fs.writeFileSync(fileB, 'b');

  let ids = {};
  {
    const store = new WorldStore(dir);
    store.loadWorld();
    const room = store.createRoom('Desk room');
    const ta = store.attachThing(room.id, fileA);
    const tb = store.attachThing(room.id, fileB);
    const note = store.addArtifact(room.id, { kind: 'room-note', title: 'Desk note', body: 'x', provenance: {} });
    store.setBrief(room.id, 'Finish the gate plan.');
    store.addToDesk(room.id, 'thing', tb.id);
    store.addToDesk(room.id, 'note', note.id);
    store.addToDesk(room.id, 'thing', ta.id);
    store.addToDesk(room.id, 'thing', ta.id); // dedup: no double entry
    ids = { roomId: room.id, ta: ta.id, tb: tb.id, note: note.id };
  }

  const store = new WorldStore(dir);
  store.loadWorld();
  const desk = store.getDeskView(ids.roomId);
  assert.equal(desk.brief, 'Finish the gate plan.');
  assert.ok(desk.briefUpdatedAt);
  assert.deepEqual(
    desk.items.map((i) => (i.type === 'thing' ? i.thing.id : i.note.id)),
    [ids.tb, ids.note, ids.ta],
    'desk order is preserved and deduplicated'
  );
  const kinds = store.getActivity(ids.roomId).map((e) => e.kind);
  assert.equal(kinds.filter((k) => k === 'brief-updated').length, 1);
  assert.equal(kinds.filter((k) => k === 'desk-added').length, 3);
});

test('adding a non-existent object to the Desk is refused, and removal logs an event', () => {
  const dir = tempDir('deskval');
  const store = new WorldStore(dir);
  store.loadWorld();
  const room = store.createRoom('Strict desk');
  assert.throws(() => store.addToDesk(room.id, 'thing', 'thing_nope'), /No such thing/);
  assert.throws(() => store.addToDesk(room.id, 'note', 'artifact_nope'), /No such note/);
  const note = store.addArtifact(room.id, { kind: 'room-note', title: 'On off', body: 'x', provenance: {} });
  store.addToDesk(room.id, 'note', note.id);
  store.removeFromDesk(room.id, 'note', note.id);
  assert.equal(store.getDesk(room.id).items.length, 0);
  const last = store.getActivity(room.id).at(-1);
  assert.equal(last.kind, 'desk-removed');
  assert.match(last.text, /stays in the Backpack/);
  assert.equal(last.refs.noteId, note.id);
});

test('detaching a thing also takes it off the Desk', () => {
  const dir = tempDir('deskdetach');
  const realDir = tempDir('real9');
  const file = path.join(realDir, 'gone.txt');
  fs.writeFileSync(file, 'x');
  const store = new WorldStore(dir);
  store.loadWorld();
  const room = store.createRoom('Prune');
  const thing = store.attachThing(room.id, file);
  store.addToDesk(room.id, 'thing', thing.id);
  store.detachThing(room.id, thing.id);
  assert.equal(store.getDesk(room.id).items.length, 0);
});

test('the working note is revised in place with an honest revision trail', () => {
  const dir = tempDir('working');
  const store = new WorldStore(dir);
  store.loadWorld();
  const room = store.createRoom('Working');
  const first = store.addArtifact(room.id, {
    kind: 'working-note',
    title: 'Plan v1',
    body: 'First synthesis.',
    provenance: { createdBy: 'papers-ai', engine: 'test', revisions: [{ at: 'x', engine: 'test' }] },
  });
  store.setWorkingNote(room.id, first.id);
  const updated = store.updateArtifact(room.id, first.id, {
    title: 'Plan v2',
    body: 'Second synthesis.',
    revision: { engine: 'test-2', sourceThings: [{ displayName: 'b.txt', path: 'C:\\b.txt', type: 'file' }] },
  });
  assert.equal(updated.id, first.id, 'same durable object');
  assert.equal(updated.title, 'Plan v2');
  assert.ok(updated.updatedAt);
  assert.equal(updated.provenance.revisions.length, 2);
  assert.equal(updated.provenance.engine, 'test-2');
  assert.equal(updated.provenance.sourceThings[0].displayName, 'b.txt');

  // Restart: still one artifact, revised, and still the Desk's working note.
  const reopened = new WorldStore(dir);
  reopened.loadWorld();
  const desk = reopened.getDeskView(room.id);
  assert.equal(desk.workingNote.id, first.id);
  assert.equal(desk.workingNote.body, 'Second synthesis.');
  assert.equal(reopened.listArtifacts(room.id).length, 1);
  assert.equal(reopened.getActivity(room.id).at(-1).kind, 'note-updated');
});

// --- Preview: read-only source inspection ----------------------------------

test('previewing a readable file reports its refreshed status and exact content', () => {
  const dir = tempDir('preview');
  const realDir = tempDir('previewreal');
  const realFile = path.join(realDir, 'plan.txt');
  fs.writeFileSync(realFile, 'the whole plan, in plain text');

  const store = new WorldStore(dir);
  store.loadWorld();
  const room = store.createRoom('Previewed');
  const thing = store.attachThing(room.id, realFile);

  const preview = store.previewThing(room.id, thing.id);
  assert.equal(preview.ok, true);
  assert.equal(preview.thing.id, thing.id);
  assert.equal(preview.thing.status, 'present');
  assert.equal(preview.thing.path, path.resolve(realFile));
  assert.equal(preview.content.kind, 'text');
  assert.equal(preview.content.truncated, false);
  assert.equal(preview.content.text, 'the whole plan, in plain text');
  assert.equal(preview.content.totalBytes, Buffer.byteLength('the whole plan, in plain text'));
  assert.equal(preview.content.shownBytes, preview.content.totalBytes);
});

test('preview reports truncation and binary content with exact counts', () => {
  const dir = tempDir('previewtrunc');
  const realDir = tempDir('previewtruncreal');
  const bigFile = path.join(realDir, 'big.txt');
  fs.writeFileSync(bigFile, 'a'.repeat(MAX_TEXT_BYTES + 500));
  const binFile = path.join(realDir, 'photo.dat');
  fs.writeFileSync(binFile, Buffer.from([137, 80, 0, 71, 13]));

  const store = new WorldStore(dir);
  store.loadWorld();
  const room = store.createRoom('Exact counts');

  const big = store.previewThing(room.id, store.attachThing(room.id, bigFile).id);
  assert.equal(big.content.kind, 'text');
  assert.equal(big.content.truncated, true);
  assert.equal(big.content.shownBytes, MAX_TEXT_BYTES);
  assert.equal(big.content.totalBytes, MAX_TEXT_BYTES + 500);
  assert.match(big.content.text, new RegExp(`showing first ${MAX_TEXT_BYTES} of ${MAX_TEXT_BYTES + 500} bytes`));

  const bin = store.previewThing(room.id, store.attachThing(room.id, binFile).id);
  assert.equal(bin.content.kind, 'binary');
  assert.equal(bin.content.totalBytes, 5);
  assert.match(bin.content.text, /binary file, 5 bytes — content not included/);
});

test('preview lists folders honestly, including the entry cap', () => {
  const dir = tempDir('previewfolder');
  const smallDir = tempDir('previewsmall');
  fs.writeFileSync(path.join(smallDir, 'one.txt'), '1');
  fs.mkdirSync(path.join(smallDir, 'sub'));
  const bigDir = tempDir('previewbig');
  for (let i = 0; i < MAX_FOLDER_ENTRIES + 5; i++) {
    fs.writeFileSync(path.join(bigDir, `f${String(i).padStart(3, '0')}.txt`), 'x');
  }

  const store = new WorldStore(dir);
  store.loadWorld();
  const room = store.createRoom('Folders');

  const small = store.previewThing(room.id, store.attachThing(room.id, smallDir).id);
  assert.equal(small.content.kind, 'folder-listing');
  assert.equal(small.content.totalEntries, 2);
  assert.equal(small.content.shownEntries, 2);
  assert.match(small.content.text, /one\.txt \(1 bytes\)/);
  assert.match(small.content.text, /sub\//);

  const big = store.previewThing(room.id, store.attachThing(room.id, bigDir).id);
  assert.equal(big.content.totalEntries, MAX_FOLDER_ENTRIES + 5);
  assert.equal(big.content.shownEntries, MAX_FOLDER_ENTRIES);
  assert.match(big.content.text, /and 5 more entries not listed/);
});

test('previewing missing reality is honest, and the transition stays a room event', () => {
  const dir = tempDir('previewmissing');
  const realDir = tempDir('previewmissingreal');
  const realFile = path.join(realDir, 'gone.txt');
  fs.writeFileSync(realFile, 'soon gone');

  const store = new WorldStore(dir);
  store.loadWorld();
  const room = store.createRoom('Gone');
  const thing = store.attachThing(room.id, realFile);
  fs.rmSync(realFile);

  const preview = store.previewThing(room.id, thing.id);
  assert.equal(preview.ok, true, 'the reference is still in the Backpack');
  assert.equal(preview.thing.status, 'missing');
  assert.equal(preview.content.ok, false);
  assert.equal(preview.content.kind, 'unreadable');
  // Losing contact was noticed by the refresh — once, as the existing
  // missing-reality behavior, not as a preview invention.
  store.previewThing(room.id, thing.id);
  const missingEvents = store.getActivity(room.id).filter((e) => e.kind === 'thing-missing');
  assert.equal(missingEvents.length, 1);
});

test('previewing a detached or unknown reference is refused honestly', () => {
  const dir = tempDir('previewdetached');
  const realDir = tempDir('previewdetachedreal');
  const realFile = path.join(realDir, 'was-here.txt');
  fs.writeFileSync(realFile, 'x');

  const store = new WorldStore(dir);
  store.loadWorld();
  const room = store.createRoom('Detached');
  const thing = store.attachThing(room.id, realFile);
  store.detachThing(room.id, thing.id);

  const detached = store.previewThing(room.id, thing.id);
  assert.equal(detached.ok, false);
  assert.match(detached.error, /no longer in this Backpack/);

  const unknown = store.previewThing(room.id, 'thing_nope');
  assert.equal(unknown.ok, false);
});

test('preview creates nothing persistent, changes no real source, and never loads the engine', () => {
  const dir = tempDir('previewinert');
  const realDir = tempDir('previewinertreal');
  const realFile = path.join(realDir, 'stable.txt');
  fs.writeFileSync(realFile, 'stable content');

  const store = new WorldStore(dir);
  store.loadWorld();
  const room = store.createRoom('Inert');
  const thing = store.attachThing(room.id, realFile);
  store.refreshThings(room.id); // settle statuses so the preview refresh is a no-op transition

  const before = {
    artifacts: store.listArtifacts(room.id).length,
    conversation: store.getConversation(room.id).length,
    deskItems: store.getDesk(room.id).items.length,
    activity: store.getActivity(room.id).length,
    bytes: fs.readFileSync(realFile),
  };
  const preview = store.previewThing(room.id, thing.id);
  assert.equal(preview.ok, true);
  store.previewThing(room.id, thing.id);

  assert.equal(store.listArtifacts(room.id).length, before.artifacts, 'no artifact was created');
  assert.equal(store.getConversation(room.id).length, before.conversation, 'no conversation entry was created');
  assert.equal(store.getDesk(room.id).items.length, before.deskItems, 'nothing was put on the Desk');
  assert.equal(store.getActivity(room.id).length, before.activity, 'no history event was invented');
  assert.deepEqual(fs.readFileSync(realFile), before.bytes, 'the real source is untouched');
  // The preview path is AI-free by construction: nothing under engine/ was
  // ever loaded into this process (this test file requires only the world).
  const engineDir = path.join(__dirname, '..', 'engine') + path.sep;
  assert.ok(
    !Object.keys(require.cache).some((p) => p.startsWith(engineDir)),
    'previewing must not load, let alone call, the AI engine'
  );
});

test('artifact provenance records the real sources it was made from', () => {
  const dir = tempDir('prov');
  const store = new WorldStore(dir);
  store.loadWorld();
  const room = store.createRoom('Provenance');
  const artifact = store.addArtifact(room.id, {
    kind: 'room-note',
    title: 'Sourced note',
    body: '…',
    provenance: {
      createdBy: 'papers-ai',
      requestedBy: 'creator',
      sourceThings: [{ displayName: 'a.txt', path: 'C:\\real\\a.txt', type: 'file' }],
    },
  });
  const loaded = new WorldStore(dir).listArtifacts(room.id);
  assert.equal(loaded[0].id, artifact.id);
  assert.equal(loaded[0].provenance.sourceThings[0].path, 'C:\\real\\a.txt');
  assert.equal(loaded[0].kind, 'room-note');
});
