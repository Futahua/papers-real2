'use strict';

// The Papers world store — the system of record for the Papers world.
//
// Rooms, thing references, room artifacts, and room conversations live here,
// in Papers-owned storage on disk. The AI engine underneath, whatever it is,
// is never the custodian of this continuity: losing or swapping the engine
// must not lose the world.
//
// On-disk layout (human-legible on purpose — the world is inspectable):
//
//   <worldDir>/
//     world.json                          world identity
//     rooms/<roomId>/room.json            room identity + title
//     rooms/<roomId>/things.json          references to real machine things
//     rooms/<roomId>/conversation.json    room-scoped conversation record
//     rooms/<roomId>/activity.json        room history: what happened here, when
//     rooms/<roomId>/artifacts/<id>.json  durable room artifacts (room notes)

const fs = require('node:fs');
const path = require('node:path');
const { newId } = require('./ids');
const { createThingReference, checkThing } = require('./things');

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

class WorldStore {
  constructor(worldDir) {
    this.worldDir = worldDir;
    this.roomsDir = path.join(worldDir, 'rooms');
  }

  worldFile() {
    return path.join(this.worldDir, 'world.json');
  }

  roomDir(roomId) {
    return path.join(this.roomsDir, roomId);
  }

  // Load the world, creating it on first open. Opening Papers always lands
  // in a persistent world — there is no transient blank-session mode.
  loadWorld() {
    let world = readJson(this.worldFile(), null);
    const now = new Date().toISOString();
    if (!world) {
      world = { id: newId('world'), name: 'My world', createdAt: now };
    }
    world.lastOpenedAt = now;
    writeJson(this.worldFile(), world);
    return world;
  }

  listRooms() {
    let entries = [];
    try {
      entries = fs.readdirSync(this.roomsDir);
    } catch {
      return [];
    }
    const rooms = [];
    for (const roomId of entries) {
      const room = readJson(path.join(this.roomDir(roomId), 'room.json'), null);
      if (!room) continue;
      const things = readJson(path.join(this.roomDir(roomId), 'things.json'), []);
      rooms.push({
        ...room,
        thingCount: things.length,
        artifactCount: this.listArtifacts(roomId).length,
      });
    }
    rooms.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    return rooms;
  }

  createRoom(title) {
    const now = new Date().toISOString();
    const room = {
      id: newId('room'),
      type: 'backpack',
      title: (title || '').trim() || 'New room',
      createdAt: now,
      lastEnteredAt: now,
    };
    writeJson(path.join(this.roomDir(room.id), 'room.json'), room);
    writeJson(path.join(this.roomDir(room.id), 'things.json'), []);
    writeJson(path.join(this.roomDir(room.id), 'conversation.json'), []);
    writeJson(path.join(this.roomDir(room.id), 'activity.json'), []);
    this.appendActivity(room.id, 'room-created', `Room "${room.title}" was created`);
    return room;
  }

  getRoomRecord(roomId) {
    const room = readJson(path.join(this.roomDir(roomId), 'room.json'), null);
    if (!room) throw new Error(`No such room in this world: ${roomId}`);
    return room;
  }

  renameRoom(roomId, title) {
    const room = this.getRoomRecord(roomId);
    const next = (title || '').trim();
    if (next && next !== room.title) {
      this.appendActivity(roomId, 'room-renamed', `Room renamed from "${room.title}" to "${next}"`);
      room.title = next;
      writeJson(path.join(this.roomDir(roomId), 'room.json'), room);
    }
    return room;
  }

  markRoomEntered(roomId) {
    const room = this.getRoomRecord(roomId);
    room.lastEnteredAt = new Date().toISOString();
    writeJson(path.join(this.roomDir(roomId), 'room.json'), room);
    return room;
  }

  // --- Things: references to real machine items -------------------------

  listThings(roomId) {
    this.getRoomRecord(roomId);
    return readJson(path.join(this.roomDir(roomId), 'things.json'), []);
  }

  saveThings(roomId, things) {
    writeJson(path.join(this.roomDir(roomId), 'things.json'), things);
  }

  attachThing(roomId, realPath) {
    const things = this.listThings(roomId);
    const resolved = path.resolve(realPath);
    const existing = things.find((t) => t.path === resolved);
    if (existing) return existing;
    const thing = createThingReference(resolved);
    things.push(thing);
    this.saveThings(roomId, things);
    this.appendActivity(roomId, 'thing-attached', `Attached ${thing.type} "${thing.displayName}" (${thing.path})`);
    return thing;
  }

  detachThing(roomId, thingId) {
    const things = this.listThings(roomId);
    const thing = things.find((t) => t.id === thingId);
    this.saveThings(roomId, things.filter((t) => t.id !== thingId));
    if (thing) {
      this.appendActivity(roomId, 'thing-detached', `Removed the reference to "${thing.displayName}" (the real ${thing.type} was not touched)`);
    }
  }

  // Re-verify every reference in the room against reality and persist what
  // was actually observed.
  refreshThings(roomId) {
    const things = this.listThings(roomId).map(checkThing);
    this.saveThings(roomId, things);
    return things;
  }

  // --- Artifacts: durable Papers-made objects that live in the room -----

  artifactsDir(roomId) {
    return path.join(this.roomDir(roomId), 'artifacts');
  }

  listArtifacts(roomId) {
    let entries = [];
    try {
      entries = fs.readdirSync(this.artifactsDir(roomId));
    } catch {
      return [];
    }
    const artifacts = [];
    for (const name of entries) {
      if (!name.endsWith('.json')) continue;
      const artifact = readJson(path.join(this.artifactsDir(roomId), name), null);
      if (artifact) artifacts.push(artifact);
    }
    artifacts.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    return artifacts;
  }

  addArtifact(roomId, { kind, title, body, provenance }) {
    this.getRoomRecord(roomId);
    const artifact = {
      id: newId('artifact'),
      roomId,
      kind: kind || 'room-note',
      title: (title || '').trim() || 'Untitled note',
      body: body || '',
      createdAt: new Date().toISOString(),
      provenance: provenance || {},
    };
    writeJson(path.join(this.artifactsDir(roomId), `${artifact.id}.json`), artifact);
    const sources = (artifact.provenance.sourceThings || []).map((s) => s.displayName).join(', ');
    this.appendActivity(
      roomId,
      'note-created',
      `The AI wrote the room note "${artifact.title}"${sources ? ` from ${sources}` : ''}`
    );
    return artifact;
  }

  // --- Activity: the room's history, owned by Papers --------------------
  // An append-only record of what happened in this room. Room events live
  // here — not in the conversation — so the room itself, not chat, is where
  // the room's life accumulates.

  getActivity(roomId) {
    this.getRoomRecord(roomId);
    return readJson(path.join(this.roomDir(roomId), 'activity.json'), []);
  }

  appendActivity(roomId, kind, text) {
    const activity = this.getActivity(roomId);
    const event = { id: newId('event'), kind, text, at: new Date().toISOString() };
    activity.push(event);
    writeJson(path.join(this.roomDir(roomId), 'activity.json'), activity);
    return event;
  }

  // --- Conversation: the room's own record, owned by Papers -------------

  getConversation(roomId) {
    this.getRoomRecord(roomId);
    return readJson(path.join(this.roomDir(roomId), 'conversation.json'), []);
  }

  appendConversation(roomId, { role, text, meta }) {
    const conversation = this.getConversation(roomId);
    const entry = {
      id: newId('entry'),
      role, // 'creator' | 'ai' | 'status'
      text,
      at: new Date().toISOString(),
      ...(meta ? { meta } : {}),
    };
    conversation.push(entry);
    writeJson(path.join(this.roomDir(roomId), 'conversation.json'), conversation);
    return entry;
  }

  // Everything a room surface needs, with thing statuses re-checked against
  // reality at read time.
  getRoomView(roomId) {
    const room = this.getRoomRecord(roomId);
    return {
      room,
      things: this.refreshThings(roomId),
      artifacts: this.listArtifacts(roomId),
      conversation: this.getConversation(roomId),
      activity: this.getActivity(roomId),
    };
  }
}

module.exports = { WorldStore };
