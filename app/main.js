'use strict';

// Papers — main process.
//
// Opening Papers loads the persistent world and opens into it. The world
// store (Papers-owned, on disk) is the system of record; the UI and the AI
// engine are both clients of it.

const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const { WorldStore } = require('./world/store');
const { checkThing, readThingContent, MAX_TEXT_BYTES } = require('./world/things');
const engine = require('./engine');

const worldDir =
  process.env.PAPERS_WORLD_DIR ||
  path.join(app.getPath('appData'), 'Papers', 'world');

const store = new WorldStore(worldDir);
let world = null;

function roomContext(roomId) {
  const view = store.getRoomView(roomId);
  return { world, ...view };
}

// --- IPC surface: named in Papers terms, nothing engine-flavored ---------

function registerHandlers(getWindow) {
  ipcMain.handle('world:get', () => ({
    world,
    worldDir,
    rooms: store.listRooms(),
  }));

  ipcMain.handle('world:createRoom', (_e, title) => store.createRoom(title));

  ipcMain.handle('room:get', (_e, roomId) => {
    store.markRoomEntered(roomId);
    return store.getRoomView(roomId);
  });

  // Same view without counting as "entering" — used after in-room actions.
  ipcMain.handle('room:refresh', (_e, roomId) => store.getRoomView(roomId));

  ipcMain.handle('room:rename', (_e, roomId, title) =>
    store.renameRoom(roomId, title)
  );

  ipcMain.handle('room:setDescription', (_e, roomId, text) =>
    store.setRoomDescription(roomId, text)
  );

  ipcMain.handle('room:pinNote', (_e, roomId, artifactId, pinned) =>
    store.setArtifactPinned(roomId, artifactId, pinned)
  );

  // Attach real files/folders via the native picker, so what enters the room
  // is always something that actually exists on the machine right now.
  ipcMain.handle('room:attachThings', async (_e, roomId, kind) => {
    const result = await dialog.showOpenDialog(getWindow(), {
      title: kind === 'folder' ? 'Attach folders to this Backpack' : 'Attach files to this Backpack',
      properties:
        kind === 'folder'
          ? ['openDirectory', 'multiSelections']
          : ['openFile', 'multiSelections'],
    });
    if (result.canceled) return { attached: [] };
    const attached = result.filePaths.map((p) => store.attachThing(roomId, p));
    return { attached };
  });

  ipcMain.handle('room:detachThing', (_e, roomId, thingId) => {
    store.detachThing(roomId, thingId);
    return store.refreshThings(roomId);
  });

  // Open the real location of a thing. If reality moved on, say so instead
  // of opening nothing quietly.
  ipcMain.handle('room:openThing', async (_e, roomId, thingId) => {
    const things = store.refreshThings(roomId);
    const thing = things.find((t) => t.id === thingId);
    if (!thing) return { ok: false, error: 'That thing is no longer in this Backpack.' };
    if (thing.status !== 'present') {
      return {
        ok: false,
        error: `"${thing.displayName}" is missing from ${thing.path} (last seen ${thing.lastCheckedAt.slice(0, 16).replace('T', ' ')}).`,
        things,
      };
    }
    if (thing.type === 'folder') {
      await shell.openPath(thing.path);
    } else {
      shell.showItemInFolder(thing.path);
    }
    return { ok: true, things };
  });

  // --- The Desk: the Backpack's active work surface -----------------------

  ipcMain.handle('desk:add', (_e, roomId, type, id) => {
    store.addToDesk(roomId, type, id);
    return store.getDeskView(roomId);
  });

  ipcMain.handle('desk:remove', (_e, roomId, type, id) => {
    store.removeFromDesk(roomId, type, id);
    return store.getDeskView(roomId);
  });

  ipcMain.handle('desk:setBrief', (_e, roomId, text) => {
    store.setBrief(roomId, text);
    return store.getDeskView(roomId);
  });

  // Everything the Desk synthesis would share with the AI, gathered in one
  // place so the guard preview and the actual action are exactly the same
  // material.
  function gatherDeskMaterial(roomId) {
    store.refreshThings(roomId); // desk statuses must reflect reality now
    const desk = store.getDeskView(roomId);
    const readings = desk.items
      .filter((i) => i.type === 'thing')
      .map((i) => ({ thing: i.thing, content: readThingContent(i.thing) }));
    const capNote = (note) => {
      const truncated = note.body.length > MAX_TEXT_BYTES;
      return {
        id: note.id,
        title: note.title,
        body: truncated
          ? note.body.slice(0, MAX_TEXT_BYTES) +
            `\n… (truncated: showing first ${MAX_TEXT_BYTES} of ${note.body.length} characters)`
          : note.body,
        truncated,
        totalChars: note.body.length,
      };
    };
    const deskNotes = desk.items.filter((i) => i.type === 'note').map((i) => capNote(i.note));
    const previousNote = desk.workingNote ? capNote(desk.workingNote) : null;
    return { desk, readings, deskNotes, previousNote };
  }

  // Guarded Desk synthesis, step 1 of 2: an exact preview of what would be
  // shared with the AI.
  ipcMain.handle('desk:synthesizePreview', (_e, roomId) => {
    const { desk, readings, deskNotes, previousNote } = gatherDeskMaterial(roomId);
    if (!desk.brief && !readings.length && !deskNotes.length) {
      return { ok: false, error: 'The Desk is empty — put things or notes on it, or write a brief, before synthesizing.' };
    }
    const items = [];
    if (desk.brief) {
      items.push({ label: 'The brief (your words)', detail: `${desk.brief.length} characters will be shared with the AI` });
    }
    for (const { thing, content } of readings) {
      items.push({
        label: `${thing.displayName} — ${thing.type}, ${thing.status}`,
        path: thing.path,
        detail:
          content.kind === 'text'
            ? `${content.shownBytes} of ${content.totalBytes} bytes will be shared${content.truncated ? ' (truncated)' : ''}`
            : content.kind === 'folder-listing'
              ? `a listing of ${content.shownEntries} of ${content.totalEntries} entries will be shared`
              : content.kind === 'binary'
                ? 'binary file — only its name and size will be shared'
                : 'unreadable — only its name and the error will be shared',
      });
    }
    for (const note of deskNotes) {
      items.push({
        label: `Desk note "${note.title}"`,
        detail: `${note.truncated ? `first ${MAX_TEXT_BYTES} of ` : ''}${note.totalChars} characters will be shared`,
      });
    }
    if (previousNote) {
      items.push({
        label: `The current working note "${previousNote.title}"`,
        detail: 'shared so the AI revises it instead of starting over',
      });
    }
    return { ok: true, items, updating: Boolean(previousNote) };
  });

  // Guarded Desk synthesis, step 2 of 2: run it and keep the result as the
  // Backpack's working note — one durable artifact, revised in place.
  ipcMain.handle('desk:synthesize', async (_e, roomId) => {
    const { desk, readings, deskNotes, previousNote } = gatherDeskMaterial(roomId);
    if (!desk.brief && !readings.length && !deskNotes.length) {
      return { ok: false, error: 'The Desk is empty — put things or notes on it, or write a brief, before synthesizing.' };
    }
    const result = await engine.synthesizeDesk(roomContext(roomId), { readings, deskNotes, previousNote });
    if (!result.ok) {
      store.appendActivity(roomId, 'note-failed', `The working note could not be revised: ${result.error}`);
      return { ok: false, error: result.error, view: store.getRoomView(roomId) };
    }
    const sourceThings = readings.map(({ thing }) => ({
      displayName: thing.displayName,
      path: thing.path,
      type: thing.type,
    }));
    const revision = {
      engine: result.engineLabel,
      requestedBy: 'creator',
      briefUsed: desk.brief || null,
      sourceThingIds: readings.map(({ thing }) => thing.id),
      sourceThings,
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
    return { ok: true, artifact, view: store.getRoomView(roomId) };
  });

  // --- Revising a Backpack note in place -----------------------------------
  // A Backpack capability, not Desk furniture: any AI-made note can be
  // revised in place under the creator's direction, with the same guard
  // shape as every Papers AI action.

  // Everything a note revision would share with the AI, gathered in one
  // place so the guard preview and the actual action are exactly the same
  // material. The note's recorded sources are re-read from reality as they
  // are NOW — missing or unreadable sources are shown honestly.
  function gatherNoteRevisionMaterial(roomId, artifactId) {
    const note = store.listArtifacts(roomId).find((a) => a.id === artifactId);
    if (!note) return { error: 'That note is not in this Backpack.' };
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
    return { note, noteForPrompt, capped, readings };
  }

  // Guarded note revision, step 1 of 2: an exact preview of what would be
  // shared with the AI.
  ipcMain.handle('note:revisePreview', (_e, roomId, artifactId, direction) => {
    const gathered = gatherNoteRevisionMaterial(roomId, artifactId);
    if (gathered.error) return { ok: false, error: gathered.error };
    const { note, capped, readings } = gathered;
    const dir = (direction || '').trim();
    const items = [];
    items.push({
      label: `The note "${note.title}" as it stands`,
      detail: `${capped ? `first ${MAX_TEXT_BYTES} of ` : ''}${note.body.length} characters will be shared`,
    });
    if (dir) {
      items.push({ label: 'Your direction (your words)', detail: `${dir.length} characters will be shared with the AI` });
    }
    for (const { thing, content } of readings) {
      items.push({
        label: `Source re-read from reality: ${thing.displayName} — ${thing.type}, ${thing.status}`,
        path: thing.path,
        detail:
          content.kind === 'text'
            ? `${content.shownBytes} of ${content.totalBytes} bytes will be shared${content.truncated ? ' (truncated)' : ''}`
            : content.kind === 'folder-listing'
              ? `a listing of ${content.shownEntries} of ${content.totalEntries} entries will be shared`
              : content.kind === 'binary'
                ? 'binary file — only its name and size will be shared'
                : 'unreadable or missing — only its name and the error will be shared',
      });
    }
    return { ok: true, items };
  });

  // Guarded note revision, step 2 of 2: run it and keep the result as the
  // same durable note — revised in place, previous text preserved in the
  // provenance trail.
  ipcMain.handle('note:revise', async (_e, roomId, artifactId, direction) => {
    const gathered = gatherNoteRevisionMaterial(roomId, artifactId);
    if (gathered.error) return { ok: false, error: gathered.error };
    const { note, noteForPrompt, readings } = gathered;
    const dir = (direction || '').trim();
    const result = await engine.reviseNote(roomContext(roomId), {
      note: noteForPrompt,
      direction: dir || null,
      readings,
    });
    if (!result.ok) {
      store.appendActivity(roomId, 'note-failed', `The note "${note.title}" could not be revised: ${result.error}`, {
        noteId: note.id,
        title: note.title,
      });
      return { ok: false, error: result.error, view: store.getRoomView(roomId) };
    }
    const revision = {
      engine: result.engineLabel,
      requestedBy: 'creator',
      direction: dir || null,
      sourceThings: readings.map(({ thing }) => ({ displayName: thing.displayName, path: thing.path, type: thing.type })),
    };
    const artifact = store.updateArtifact(roomId, artifactId, {
      title: result.title || note.title,
      body: result.body,
      revision,
    });
    return { ok: true, artifact, view: store.getRoomView(roomId) };
  });

  // The real state, right now, of the sources a note was made from. A note
  // stays honestly connected to reality: each source is re-checked against
  // the filesystem and against the room's current things.
  ipcMain.handle('room:noteSources', (_e, roomId, artifactId) => {
    const artifact = store.listArtifacts(roomId).find((a) => a.id === artifactId);
    if (!artifact) return { ok: false, error: 'That note is not in this Backpack.' };
    const things = store.listThings(roomId);
    const sources = (artifact.provenance?.sourceThings || []).map((s) => {
      let status = 'missing';
      let type = s.type;
      try {
        const st = fs.statSync(s.path);
        status = 'present';
        type = st.isDirectory() ? 'folder' : 'file';
      } catch {}
      return {
        displayName: s.displayName,
        path: s.path,
        type,
        status,
        attached: things.some((t) => t.path === s.path),
      };
    });
    return { ok: true, sources };
  });

  // Open a real location by path — honest refusal if reality moved on.
  ipcMain.handle('world:openRealPath', async (_e, realPath) => {
    try {
      const st = fs.statSync(realPath);
      if (st.isDirectory()) await shell.openPath(realPath);
      else shell.showItemInFolder(realPath);
      return { ok: true };
    } catch {
      return { ok: false, error: `Nothing exists at ${realPath} any more.` };
    }
  });

  ipcMain.handle('room:say', async (_e, roomId, text) => {
    store.appendConversation(roomId, { role: 'creator', text });
    const result = await engine.roomReply(roomContext(roomId), text);
    if (result.ok) {
      store.appendConversation(roomId, {
        role: 'ai',
        text: result.text,
        meta: { engine: result.engineLabel },
      });
    } else {
      store.appendConversation(roomId, { role: 'status', text: result.error });
    }
    return store.getConversation(roomId);
  });

  // Guarded action, step 1 of 2: an exact preview of what would be read from
  // the real machine — paths, sizes, truncation — before anything is sent to
  // the AI. Nothing is read speculatively and nothing leaves without approval.
  ipcMain.handle('room:notePreview', (_e, roomId, thingIds) => {
    const things = store.refreshThings(roomId).filter((t) => thingIds.includes(t.id));
    if (!things.length) return { ok: false, error: 'No things selected.' };
    const items = things.map((thing) => {
      const content = readThingContent(thing);
      return {
        thingId: thing.id,
        displayName: thing.displayName,
        path: thing.path,
        type: thing.type,
        status: thing.status,
        kind: content.kind,
        detail:
          content.kind === 'text'
            ? `${content.shownBytes} of ${content.totalBytes} bytes will be shared with the AI${content.truncated ? ' (truncated)' : ''}`
            : content.kind === 'folder-listing'
              ? `a listing of ${content.shownEntries} of ${content.totalEntries} entries will be shared with the AI`
              : content.kind === 'binary'
                ? 'binary file — only its name and size will be shared'
                : 'unreadable — only its name and the error will be shared',
      };
    });
    return { ok: true, items };
  });

  // Guarded action, step 2 of 2: actually read the approved things, ask the
  // AI for a note, and keep the result as a durable room artifact with honest
  // provenance.
  ipcMain.handle('room:createNote', async (_e, roomId, thingIds) => {
    const things = store.refreshThings(roomId).filter((t) => thingIds.includes(t.id));
    if (!things.length) return { ok: false, error: 'No things selected.' };
    const readings = things.map((thing) => ({ thing, content: readThingContent(thing) }));
    const result = await engine.generateRoomNote(roomContext(roomId), readings);
    if (!result.ok) {
      // A room event, honestly recorded in the room's own history.
      store.appendActivity(roomId, 'note-failed', `A room note could not be written: ${result.error}`);
      return { ok: false, error: result.error, activity: store.getActivity(roomId) };
    }
    const artifact = store.addArtifact(roomId, {
      kind: 'room-note',
      title: result.title || `Note on ${things.map((t) => t.displayName).join(', ')}`,
      body: result.body,
      provenance: {
        createdBy: 'papers-ai',
        engine: result.engineLabel,
        requestedBy: 'creator',
        sourceThingIds: things.map((t) => t.id),
        sourceThings: things.map((t) => ({ displayName: t.displayName, path: t.path, type: t.type })),
      },
    });
    return {
      ok: true,
      artifact,
      artifacts: store.listArtifacts(roomId),
      activity: store.getActivity(roomId),
    };
  });
}

// --- Smoke mode: exercises world load + store wiring without a display ----

async function smokeCheck() {
  const w = store.loadWorld();
  const rooms = store.listRooms();
  console.log(`[papers-smoke] world "${w.name}" (${w.id}) at ${worldDir}`);
  console.log(`[papers-smoke] rooms: ${rooms.length}`);
  for (const r of rooms) {
    const view = store.getRoomView(r.id);
    console.log(
      `[papers-smoke] room "${r.title}": ${view.things.length} things, ${view.artifacts.length} artifacts, ${view.conversation.length} conversation entries, ${view.activity.length} history events`
    );
  }
  console.log('[papers-smoke] OK');
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1240,
    height: 840,
    title: 'Papers',
    backgroundColor: '#f5f0e6',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);
  // Dev/test affordance only: PAPERS_OPEN_ROOM=<roomId|first> opens straight
  // into a room. Not a product surface.
  const openRoom = (process.env.PAPERS_OPEN_ROOM || '').trim();
  win.loadFile(
    path.join(__dirname, 'ui', 'index.html'),
    openRoom ? { hash: `open-room=${openRoom}` } : undefined
  );
  return win;
}

// One instance owns the world at a time. Two Papers instances over the same
// world directory would silently clobber each other's JSON writes — the
// second instance says so and leaves, rather than corrupting continuity.
if (!app.requestSingleInstanceLock()) {
  console.error('[papers] Another Papers instance already has this world open. Exiting instead of writing over it.');
  app.quit();
}

app.whenReady().then(async () => {
  if (process.argv.includes('--papers-smoke')) {
    try {
      await smokeCheck();
      app.exit(0);
    } catch (err) {
      console.error('[papers-smoke] FAILED:', err);
      app.exit(1);
    }
    return;
  }
  world = store.loadWorld();
  let win = createWindow();
  registerHandlers(() => win);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) win = createWindow();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
