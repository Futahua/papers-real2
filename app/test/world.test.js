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
const { readThingContent, MAX_TEXT_BYTES } = require('../world/things');

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
