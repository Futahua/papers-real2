'use strict';

// The Papers world store — the system of record for the Papers world.
//
// Vocabulary note: what this module calls a "room" is a Backpack — the
// Papers-native place. "room" persists here only as an implementation and
// schema label (see DOCS/PAPERS_ONTOLOGY_CLARIFICATION_V1.txt).
//
// Backpacks, thing references, artifacts, and conversations live here,
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
//     rooms/<roomId>/desk.json            the Backpack's active work surface
//     rooms/<roomId>/artifacts/<id>.json  durable room artifacts (room notes)

const fs = require('node:fs');
const path = require('node:path');
const { newId } = require('./ids');
const { createThingReference, checkThing, readThingContent } = require('./things');

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
      const activity = readJson(path.join(this.roomDir(roomId), 'activity.json'), []);
      const last = activity[activity.length - 1];
      rooms.push({
        ...room,
        thingCount: things.length,
        missingCount: things.filter((t) => t.status === 'missing').length,
        artifactCount: this.listArtifacts(roomId).length,
        lastActivity: last ? { text: last.text, at: last.at } : null,
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
      title: (title || '').trim() || 'New Backpack',
      createdAt: now,
      lastEnteredAt: now,
    };
    writeJson(path.join(this.roomDir(room.id), 'room.json'), room);
    writeJson(path.join(this.roomDir(room.id), 'things.json'), []);
    writeJson(path.join(this.roomDir(room.id), 'conversation.json'), []);
    writeJson(path.join(this.roomDir(room.id), 'activity.json'), []);
    this.appendActivity(room.id, 'room-created', `Backpack "${room.title}" was created`);
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
      this.appendActivity(roomId, 'room-renamed', `Backpack renamed from "${room.title}" to "${next}"`);
      room.title = next;
      writeJson(path.join(this.roomDir(roomId), 'room.json'), room);
    }
    return room;
  }

  // Entering a room shifts the visit history: the room remembers when you
  // were last here, so it can honestly tell you what happened in between.
  markRoomEntered(roomId) {
    const room = this.getRoomRecord(roomId);
    room.previousEnteredAt = room.lastEnteredAt || null;
    room.lastEnteredAt = new Date().toISOString();
    writeJson(path.join(this.roomDir(roomId), 'room.json'), room);
    return room;
  }

  // The room's own description — creator-owned durable room state, part of
  // the room record, not a chat answer pasted into the UI.
  setRoomDescription(roomId, text) {
    const room = this.getRoomRecord(roomId);
    const next = (text || '').trim();
    const current = room.description || '';
    if (next === current) return room;
    room.description = next;
    room.descriptionUpdatedAt = new Date().toISOString();
    writeJson(path.join(this.roomDir(roomId), 'room.json'), room);
    this.appendActivity(
      roomId,
      'room-described',
      next ? 'The Backpack description was updated' : 'The Backpack description was cleared'
    );
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
    this.appendActivity(roomId, 'thing-attached', `Attached ${thing.type} "${thing.displayName}" (${thing.path})`, {
      thingId: thing.id,
      path: thing.path,
      displayName: thing.displayName,
    });
    return thing;
  }

  detachThing(roomId, thingId) {
    const things = this.listThings(roomId);
    const thing = things.find((t) => t.id === thingId);
    this.saveThings(roomId, things.filter((t) => t.id !== thingId));
    // Leaving the Backpack means leaving the Desk too; the detach event
    // below covers both.
    const desk = this.getDesk(roomId);
    if (desk.items.some((i) => i.type === 'thing' && i.id === thingId)) {
      desk.items = desk.items.filter((i) => !(i.type === 'thing' && i.id === thingId));
      this.saveDesk(roomId, desk);
    }
    if (thing) {
      this.appendActivity(roomId, 'thing-detached', `Removed the reference to "${thing.displayName}" (the real ${thing.type} was not touched)`, {
        thingId: thing.id,
        path: thing.path,
        displayName: thing.displayName,
      });
    }
  }

  // Re-verify every reference in the room against reality and persist what
  // was actually observed. Losing contact with a real thing — or regaining
  // it — is part of the room's life, so those transitions become room
  // events, not silent state flips.
  refreshThings(roomId) {
    const before = this.listThings(roomId);
    const things = before.map(checkThing);
    this.saveThings(roomId, things);
    for (let i = 0; i < things.length; i++) {
      const was = before[i].status;
      const now = things[i].status;
      if (was === now) continue;
      const refs = { thingId: things[i].id, path: things[i].path, displayName: things[i].displayName };
      if (now === 'missing' && was === 'present') {
        this.appendActivity(roomId, 'thing-missing', `Lost contact with "${things[i].displayName}" — nothing at ${things[i].path}`, refs);
      } else if (now === 'present' && was === 'missing') {
        this.appendActivity(roomId, 'thing-recovered', `"${things[i].displayName}" is back at ${things[i].path}`, refs);
      }
    }
    return things;
  }

  // A read-only look at what a thing reference really holds right now:
  // source inspection, not import. The reference is re-checked against
  // reality and read through the same truthful path the AI actions use.
  // No AI is involved and nothing new is created — the only writes are the
  // honest status refresh every room surface already performs.
  previewThing(roomId, thingId) {
    const things = this.refreshThings(roomId);
    const thing = things.find((t) => t.id === thingId);
    if (!thing) {
      return { ok: false, error: 'That thing is no longer in this Backpack.' };
    }
    return { ok: true, thing, content: readThingContent(thing) };
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
      `The AI wrote the ${artifact.kind === 'working-note' ? 'working note' : 'Backpack note'} "${artifact.title}"${sources ? ` from ${sources}` : ''}`,
      { noteId: artifact.id, title: artifact.title }
    );
    return artifact;
  }

  // --- The Desk: the Backpack's active work surface ----------------------
  // The Desk is what the creator is working on right now, as opposed to
  // everything the Backpack holds. It carries a brief (the current focus,
  // in the creator's words), an ordered set of desk items (things and notes
  // placed on the Desk), and the id of the working note — the one durable
  // artifact the AI revises in place from the Desk. All of it is
  // Papers-owned and survives restart.

  deskFile(roomId) {
    return path.join(this.roomDir(roomId), 'desk.json');
  }

  getDesk(roomId) {
    this.getRoomRecord(roomId);
    return readJson(this.deskFile(roomId), {
      brief: '',
      briefUpdatedAt: null,
      items: [], // [{ type: 'thing' | 'note', id }]
      workingNoteId: null,
    });
  }

  saveDesk(roomId, desk) {
    writeJson(this.deskFile(roomId), desk);
    return desk;
  }

  setBrief(roomId, text) {
    const desk = this.getDesk(roomId);
    const next = (text || '').trim();
    if (next === desk.brief) return desk;
    desk.brief = next;
    desk.briefUpdatedAt = new Date().toISOString();
    this.saveDesk(roomId, desk);
    this.appendActivity(
      roomId,
      'brief-updated',
      next ? 'The Backpack brief was updated' : 'The Backpack brief was cleared'
    );
    return desk;
  }

  // Put a thing or note on the Desk. The object must actually exist in the
  // Backpack — the Desk never points at work that is not there.
  addToDesk(roomId, type, id) {
    const desk = this.getDesk(roomId);
    if (desk.items.some((i) => i.type === type && i.id === id)) return desk;
    let displayName;
    if (type === 'thing') {
      const thing = this.listThings(roomId).find((t) => t.id === id);
      if (!thing) throw new Error(`No such thing in this Backpack: ${id}`);
      displayName = thing.displayName;
      this.appendActivity(roomId, 'desk-added', `"${thing.displayName}" was placed on the Desk`, {
        thingId: thing.id,
        path: thing.path,
        displayName: thing.displayName,
      });
    } else if (type === 'note') {
      const note = this.listArtifacts(roomId).find((a) => a.id === id);
      if (!note) throw new Error(`No such note in this Backpack: ${id}`);
      displayName = note.title;
      this.appendActivity(roomId, 'desk-added', `The note "${note.title}" was placed on the Desk`, {
        noteId: note.id,
        title: note.title,
      });
    } else {
      throw new Error(`Unknown desk item type: ${type}`);
    }
    desk.items.push({ type, id });
    this.saveDesk(roomId, desk);
    return desk;
  }

  removeFromDesk(roomId, type, id) {
    const desk = this.getDesk(roomId);
    if (!desk.items.some((i) => i.type === type && i.id === id)) return desk;
    desk.items = desk.items.filter((i) => !(i.type === type && i.id === id));
    this.saveDesk(roomId, desk);
    let label = id;
    let refs;
    if (type === 'thing') {
      const thing = this.listThings(roomId).find((t) => t.id === id);
      if (thing) {
        label = `"${thing.displayName}"`;
        refs = { thingId: thing.id, path: thing.path, displayName: thing.displayName };
      }
    } else {
      const note = this.listArtifacts(roomId).find((a) => a.id === id);
      if (note) {
        label = `The note "${note.title}"`;
        refs = { noteId: note.id, title: note.title };
      }
    }
    this.appendActivity(roomId, 'desk-removed', `${label} was taken off the Desk (it stays in the Backpack)`, refs);
    return desk;
  }

  // The Desk resolved against what actually exists right now. Items whose
  // object has left the Backpack are pruned; today the only product path
  // that removes desk-referenced objects is detachThing, which prunes the
  // Desk itself, so this is a defensive backstop rather than a silent
  // history rewrite.
  getDeskView(roomId) {
    const desk = this.getDesk(roomId);
    const things = this.listThings(roomId);
    const artifacts = this.listArtifacts(roomId);
    const items = [];
    const live = [];
    for (const item of desk.items) {
      const obj =
        item.type === 'thing'
          ? things.find((t) => t.id === item.id)
          : artifacts.find((a) => a.id === item.id);
      if (!obj) continue;
      live.push(item);
      items.push({ type: item.type, [item.type]: obj });
    }
    if (live.length !== desk.items.length) {
      desk.items = live;
      this.saveDesk(roomId, desk);
    }
    const workingNote = desk.workingNoteId
      ? artifacts.find((a) => a.id === desk.workingNoteId) || null
      : null;
    return {
      brief: desk.brief,
      briefUpdatedAt: desk.briefUpdatedAt,
      items,
      workingNote,
    };
  }

  setWorkingNote(roomId, artifactId) {
    const desk = this.getDesk(roomId);
    desk.workingNoteId = artifactId;
    this.saveDesk(roomId, desk);
    return desk;
  }

  // Revise an artifact in place — same object, new text, honest trail. Used
  // for the Desk's working note so active work accumulates in one durable
  // place instead of scattering into ever more one-shot notes.
  updateArtifact(roomId, artifactId, { title, body, revision }) {
    const file = path.join(this.artifactsDir(roomId), `${artifactId}.json`);
    const artifact = readJson(file, null);
    if (!artifact) throw new Error(`No such note in this Backpack: ${artifactId}`);
    if (title) artifact.title = title;
    artifact.body = body;
    artifact.updatedAt = new Date().toISOString();
    artifact.provenance = artifact.provenance || {};
    if (revision) {
      artifact.provenance.revisions = artifact.provenance.revisions || [];
      artifact.provenance.revisions.push({ at: artifact.updatedAt, ...revision });
      // The artifact-level source list reflects what the CURRENT text was
      // made from; the revisions trail keeps the full history.
      if (revision.sourceThings) artifact.provenance.sourceThings = revision.sourceThings;
      if (revision.sourceThingIds) artifact.provenance.sourceThingIds = revision.sourceThingIds;
      if (revision.engine) artifact.provenance.engine = revision.engine;
    }
    writeJson(file, artifact);
    this.appendActivity(roomId, 'note-updated', `The AI revised the working note "${artifact.title}"`, {
      noteId: artifact.id,
      title: artifact.title,
    });
    return artifact;
  }

  // Pin or unpin a note to the room. Pinned work belongs to the room's
  // landing, not just its list — the pin lives on the artifact record.
  setArtifactPinned(roomId, artifactId, pinned) {
    const file = path.join(this.artifactsDir(roomId), `${artifactId}.json`);
    const artifact = readJson(file, null);
    if (!artifact) throw new Error(`No such note in this room: ${artifactId}`);
    if (Boolean(artifact.pinned) === Boolean(pinned)) return artifact;
    artifact.pinned = Boolean(pinned);
    artifact.pinnedAt = pinned ? new Date().toISOString() : null;
    writeJson(file, artifact);
    this.appendActivity(
      roomId,
      pinned ? 'note-pinned' : 'note-unpinned',
      pinned ? `The note "${artifact.title}" was pinned to the Backpack` : `The note "${artifact.title}" was unpinned`,
      { noteId: artifact.id, title: artifact.title }
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

  // `refs` optionally ties an event to the room objects it is about
  // ({ noteId, title } and/or { thingId, path, displayName }), so history
  // stays navigable — and stays honest if the object later changes or
  // leaves the room. Events written before refs existed simply have none.
  appendActivity(roomId, kind, text, refs) {
    const activity = this.getActivity(roomId);
    const event = {
      id: newId('event'),
      kind,
      text,
      at: new Date().toISOString(),
      ...(refs ? { refs } : {}),
    };
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
      desk: this.getDeskView(roomId),
      activity: this.getActivity(roomId),
    };
  }
}

module.exports = { WorldStore };
