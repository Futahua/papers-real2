'use strict';

// Papers renderer. Two surfaces, in Papers order: the world, then a room.
//
// The room is the primary surface. Its contents — things, notes, history —
// own the space; the conversation is one region of the room, collapsible,
// never the shell. Only persisted world data is ever shown as room record;
// transient errors render inline and are visibly transient.

const appEl = document.getElementById('app');

const state = {
  view: 'world', // 'world' | 'room'
  world: null,
  rooms: [],
  roomId: null,
  room: null, // { room, things, artifacts, conversation, activity }
  openNoteId: null, // when set, the room surface shows this note
  noteSources: null, // { artifactId, rows } — live reality-check of an open note's sources
  selectedThings: new Set(),
  thinking: false,
  guard: null, // { items, thingIds }
  inlineError: null, // { scope: 'things' | 'notes', text }
  talkOpen: localStorage.getItem('papers-ui:talk-open') !== 'no',
};

function esc(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function fmtDate(iso) {
  if (!iso) return '';
  return iso.slice(0, 16).replace('T', ' ');
}

function fmtDay(iso) {
  return iso ? iso.slice(0, 10) : '';
}

// ---- Data loading --------------------------------------------------------

async function loadWorld() {
  const data = await window.papers.getWorld();
  state.world = data.world;
  state.rooms = data.rooms;
  render();
  console.log(`[papers-ui] world rendered: "${state.world.name}", ${state.rooms.length} room(s)`);
}

async function enterRoom(roomId) {
  state.view = 'room';
  state.roomId = roomId;
  state.room = await window.papers.getRoom(roomId);
  state.openNoteId = null;
  state.selectedThings = new Set();
  state.inlineError = null;
  render();
  scrollTalk();
}

async function refreshRoom() {
  state.room = await window.papers.refreshRoom(state.roomId);
}

async function backToWorld() {
  state.view = 'world';
  state.roomId = null;
  state.room = null;
  state.openNoteId = null;
  state.guard = null;
  state.inlineError = null;
  await loadWorld();
}

// ---- World view ----------------------------------------------------------

function renderWorld() {
  const w = state.world;
  const cards = state.rooms
    .map(
      (r) => `
      <div class="room-card" data-room="${esc(r.id)}">
        <h2>${esc(r.title)}</h2>
        <div class="room-counts">${r.thingCount} thing${r.thingCount === 1 ? '' : 's'} · ${r.artifactCount} note${r.artifactCount === 1 ? '' : 's'}</div>
        <div class="room-counts">last entered ${fmtDate(r.lastEnteredAt)}</div>
      </div>`
    )
    .join('');
  appEl.innerHTML = `
    <div class="world">
      <div class="wordmark">Papers</div>
      <h1>${esc(w.name)}</h1>
      <div class="world-meta">This world has existed since ${fmtDate(w.createdAt)}. It stays when Papers closes.</div>
      <div class="room-grid">
        ${cards}
        <div class="room-card new-room" id="new-room-card">+ New room</div>
      </div>
      <form class="new-room-form" id="new-room-form" hidden>
        <input type="text" id="new-room-title" placeholder="Name this room…" maxlength="80" />
        <button class="primary" type="submit">Create room</button>
      </form>
    </div>`;

  appEl.querySelectorAll('.room-card[data-room]').forEach((el) => {
    el.addEventListener('click', () => enterRoom(el.dataset.room));
  });
  const newCard = document.getElementById('new-room-card');
  const form = document.getElementById('new-room-form');
  newCard.addEventListener('click', () => {
    form.hidden = false;
    document.getElementById('new-room-title').focus();
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('new-room-title').value;
    const room = await window.papers.createRoom(title);
    await enterRoom(room.id);
  });
}

// ---- Room view: pieces -----------------------------------------------------

function thingRow(t) {
  const missing =
    t.status === 'missing'
      ? `<span class="thing-missing-note">missing — last seen at this path ${fmtDate(t.lastCheckedAt)}</span>`
      : '';
  return `
    <div class="thing-row">
      <input type="checkbox" data-select-thing="${esc(t.id)}" ${state.selectedThings.has(t.id) ? 'checked' : ''} title="Select for a room note" />
      <span class="status-dot ${esc(t.status)}" title="${esc(t.status)}"></span>
      <span class="thing-main">
        <span class="thing-name">${esc(t.displayName)} <span class="preview-detail">· ${esc(t.type)}</span></span>
        <span class="thing-path" title="${esc(t.path)}">${esc(t.path)}</span>
        ${missing}
      </span>
      <button class="quiet" data-open-thing="${esc(t.id)}" ${t.status !== 'present' ? 'disabled title="The real item is missing"' : 'title="Open the real location on this machine"'}>Open real location</button>
      <button class="quiet" data-detach-thing="${esc(t.id)}" title="Remove the reference from this room (the real item is not touched)">Remove</button>
    </div>`;
}

function noteCard(a) {
  const from = (a.provenance?.sourceThings || []).map((s) => s.displayName).join(', ');
  const snippet = (a.body || '').replace(/\s+/g, ' ').slice(0, 150);
  return `
    <div class="note-card" data-note="${esc(a.id)}">
      <h3>${esc(a.title)}</h3>
      <div class="note-snippet">${esc(snippet)}${a.body && a.body.length > 150 ? '…' : ''}</div>
      <div class="note-provenance">
        <span class="provenance-chip">Papers AI</span>
        ${fmtDate(a.createdAt)}${from ? ` · from ${esc(from)}` : ''}
      </div>
    </div>`;
}

function activityLine(e) {
  return `<div class="activity-line ${e.kind === 'note-failed' ? 'failed' : ''}"><span class="activity-when">${fmtDate(e.at)}</span> ${esc(e.text)}</div>`;
}

function talkEntry(e) {
  const who = e.role === 'creator' ? 'You' : e.role === 'ai' ? 'The AI' : 'Papers';
  return `
    <div class="talk-entry ${esc(e.role)}">
      <span class="who">${who} · ${fmtDate(e.at)}</span>
      <span class="bubble">${esc(e.text)}</span>
    </div>`;
}

function inlineError(scope) {
  if (!state.inlineError || state.inlineError.scope !== scope) return '';
  return `<div class="inline-error">${esc(state.inlineError.text)} <button class="quiet" id="dismiss-error">dismiss</button></div>`;
}

// The room's contents: things, notes, history. This is the primary surface.
function roomContentsHtml() {
  const { things, artifacts, activity } = state.room;
  const selCount = state.selectedThings.size;
  const recentActivity = activity.slice(-8);
  const earlier = activity.length - recentActivity.length;
  return `
    <div class="section">
      <h2 class="section-title">Things in this room</h2>
      ${things.length ? things.map(thingRow).join('') : '<div class="empty-hint">Nothing here yet. Attach real files or folders from this machine — Papers keeps references, the originals stay where they are.</div>'}
      ${inlineError('things')}
      <div class="section-actions">
        <button id="attach-file">+ Attach files</button>
        <button id="attach-folder">+ Attach folder</button>
        <button class="primary" id="make-note" ${selCount ? '' : 'disabled'}>Write a room note from ${selCount || 'selected'} thing${selCount === 1 ? '' : 's'}</button>
      </div>
    </div>
    <div class="section">
      <h2 class="section-title">Room notes</h2>
      ${artifacts.length ? artifacts.map(noteCard).join('') : '<div class="empty-hint">No notes yet. Select things above and ask for a room note — what the AI writes stays here.</div>'}
      ${inlineError('notes')}
    </div>
    <div class="section">
      <h2 class="section-title">Room history</h2>
      ${recentActivity.length ? recentActivity.map(activityLine).join('') : '<div class="empty-hint">Nothing has happened here yet.</div>'}
      ${earlier > 0 ? `<div class="activity-line earlier">… and ${earlier} earlier event${earlier === 1 ? '' : 's'}, kept by Papers.</div>` : ''}
    </div>`;
}

// A note opened as a room surface of its own — an object in the room, not a
// popup over it. Its sources are shown as live references, re-checked
// against reality, not as dead text.
function noteSourceRow(s) {
  return `
    <div class="thing-row">
      <span class="status-dot ${esc(s.status)}" title="${esc(s.status)}"></span>
      <span class="thing-main">
        <span class="thing-name">${esc(s.displayName)} <span class="preview-detail">· ${esc(s.type)}${s.attached ? '' : ' · no longer attached to this room'}</span></span>
        <span class="thing-path" title="${esc(s.path)}">${esc(s.path)}</span>
        ${s.status === 'missing' ? '<span class="thing-missing-note">missing — nothing exists at this path right now</span>' : ''}
      </span>
      <button class="quiet" data-open-source="${esc(s.path)}" ${s.status !== 'present' ? 'disabled title="The real item is missing"' : 'title="Open the real location on this machine"'}>Open real location</button>
    </div>`;
}

function noteSourcesHtml(a) {
  if (!a.provenance?.sourceThings?.length) return '';
  const loaded = state.noteSources && state.noteSources.artifactId === a.id;
  return `
    <div class="section note-made-from">
      <h2 class="section-title">Made from</h2>
      ${loaded ? state.noteSources.rows.map(noteSourceRow).join('') : '<div class="empty-hint">Checking the real sources…</div>'}
      ${inlineError('note')}
    </div>`;
}

function noteSurfaceHtml(a) {
  return `
    <div class="note-surface">
      <button class="quiet" id="close-note">← Back to room contents</button>
      <h2 class="note-title">${esc(a.title)}</h2>
      <div class="note-provenance">
        <span class="provenance-chip">Papers AI</span>
        Written ${fmtDate(a.createdAt)}${a.provenance?.engine ? ` · via ${esc(a.provenance.engine)}` : ''}
      </div>
      <div class="note-body">${esc(a.body)}</div>
      ${noteSourcesHtml(a)}
      <div class="note-footer">This note is a Papers artifact kept in this room — not a file on your machine.</div>
    </div>`;
}

async function loadNoteSources(artifactId) {
  const result = await window.papers.noteSources(state.roomId, artifactId);
  if (state.openNoteId !== artifactId) return; // the creator moved on
  state.noteSources = { artifactId, rows: result.ok ? result.sources : [] };
  render();
}

function openNoteSurface(artifactId) {
  state.openNoteId = artifactId;
  state.noteSources = null;
  render();
  loadNoteSources(artifactId);
}

function talkPanelHtml() {
  const { conversation } = state.room;
  if (!state.talkOpen) {
    return `
      <div class="room-talk closed">
        <button class="quiet talk-toggle" id="talk-toggle" title="Open the room conversation">◂ Conversation${conversation.length ? ` (${conversation.length})` : ''}</button>
      </div>`;
  }
  return `
    <div class="room-talk">
      <div class="talk-head">
        <h2 class="section-title">Room conversation</h2>
        <button class="quiet" id="talk-toggle" title="Tuck the conversation away">▸</button>
      </div>
      <div class="talk-scroll" id="talk-scroll">
        ${conversation.length ? conversation.map(talkEntry).join('') : '<div class="empty-hint">The AI is present in this room and knows what it holds.</div>'}
      </div>
      ${state.thinking ? '<div class="thinking">The AI is thinking…</div>' : ''}
      <form class="talk-input" id="talk-form">
        <textarea id="talk-text" placeholder="Say something in this room…"></textarea>
        <button class="primary" type="submit" ${state.thinking ? 'disabled' : ''}>Send</button>
      </form>
    </div>`;
}

// ---- Room view: assembly ---------------------------------------------------

function renderRoom() {
  const { room, things, artifacts } = state.room;
  const openNote = state.openNoteId ? artifacts.find((a) => a.id === state.openNoteId) : null;
  appEl.innerHTML = `
    <div class="room-page">
      <div class="room-header">
        <button class="quiet back" id="back-to-world">← ${esc(state.world.name)}</button>
        <div class="room-head-main">
          <h1 class="room-title" id="room-title" title="Click to rename">${esc(room.title)}</h1>
          <div class="room-identity">A room in this world since ${fmtDay(room.createdAt)} · ${things.length} thing${things.length === 1 ? '' : 's'} · ${artifacts.length} note${artifacts.length === 1 ? '' : 's'}</div>
        </div>
      </div>
      <div class="room-body">
        <div class="room-contents">
          ${openNote ? noteSurfaceHtml(openNote) : roomContentsHtml()}
        </div>
        ${talkPanelHtml()}
      </div>
    </div>
    ${renderGuard()}`;

  document.getElementById('back-to-world').addEventListener('click', backToWorld);
  wireRoomTitle(room);
  if (openNote) {
    document.getElementById('close-note').addEventListener('click', () => {
      state.openNoteId = null;
      state.noteSources = null;
      state.inlineError = null;
      render();
    });
    appEl.querySelectorAll('[data-open-source]').forEach((el) => {
      el.addEventListener('click', async () => {
        const result = await window.papers.openRealPath(el.dataset.openSource);
        state.inlineError = result.ok ? null : { scope: 'note', text: result.error };
        // Re-check the sources — reality may have just changed.
        loadNoteSources(openNote.id);
        render();
      });
    });
  } else {
    wireContents(room);
  }
  wireTalk(room);
  wireGuard();
  const dismiss = document.getElementById('dismiss-error');
  if (dismiss) {
    dismiss.addEventListener('click', () => {
      state.inlineError = null;
      render();
    });
  }
}

function wireRoomTitle(room) {
  const titleEl = document.getElementById('room-title');
  titleEl.addEventListener('click', () => {
    if (titleEl.querySelector('input')) return;
    titleEl.innerHTML = `<input type="text" value="${esc(room.title)}" maxlength="80" />`;
    const input = titleEl.querySelector('input');
    input.focus();
    input.select();
    let done = false;
    const commit = async () => {
      if (done) return;
      done = true;
      const updated = await window.papers.renameRoom(room.id, input.value);
      state.room.room = updated;
      await refreshRoom(); // pick up the rename event in room history
      render();
    };
    const cancel = () => {
      if (done) return;
      done = true;
      render();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') commit();
      if (e.key === 'Escape') cancel();
    });
    input.addEventListener('blur', commit);
  });
}

function wireContents(room) {
  document.getElementById('attach-file').addEventListener('click', () => attach('file'));
  document.getElementById('attach-folder').addEventListener('click', () => attach('folder'));

  appEl.querySelectorAll('[data-select-thing]').forEach((el) => {
    el.addEventListener('change', () => {
      const id = el.dataset.selectThing;
      if (el.checked) state.selectedThings.add(id);
      else state.selectedThings.delete(id);
      render();
    });
  });

  appEl.querySelectorAll('[data-open-thing]').forEach((el) => {
    el.addEventListener('click', async () => {
      const result = await window.papers.openThing(room.id, el.dataset.openThing);
      if (result.things) state.room.things = result.things;
      state.inlineError = result.ok ? null : { scope: 'things', text: result.error };
      render();
    });
  });

  appEl.querySelectorAll('[data-detach-thing]').forEach((el) => {
    el.addEventListener('click', async () => {
      await window.papers.detachThing(room.id, el.dataset.detachThing);
      state.selectedThings.delete(el.dataset.detachThing);
      await refreshRoom();
      render();
    });
  });

  document.getElementById('make-note').addEventListener('click', async () => {
    const ids = [...state.selectedThings];
    const preview = await window.papers.notePreview(room.id, ids);
    if (!preview.ok) {
      state.inlineError = { scope: 'things', text: preview.error };
      render();
      return;
    }
    state.guard = { items: preview.items, thingIds: ids };
    render();
  });

  appEl.querySelectorAll('[data-note]').forEach((el) => {
    el.addEventListener('click', () => openNoteSurface(el.dataset.note));
  });
}

async function attach(kind) {
  await window.papers.attachThings(state.roomId, kind);
  await refreshRoom();
  render();
}

function wireTalk(room) {
  const toggle = document.getElementById('talk-toggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      state.talkOpen = !state.talkOpen;
      localStorage.setItem('papers-ui:talk-open', state.talkOpen ? 'yes' : 'no');
      render();
      scrollTalk();
    });
  }
  const form = document.getElementById('talk-form');
  if (!form) return;
  const textEl = document.getElementById('talk-text');
  textEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = textEl.value.trim();
    if (!text || state.thinking) return;
    textEl.value = '';
    // Optimistic echo of the creator's own words — room:say persists the
    // same entry, and the conversation is replaced by the persisted record.
    state.room.conversation.push({
      id: `pending_${Date.now()}`,
      role: 'creator',
      text,
      at: new Date().toISOString(),
    });
    state.thinking = true;
    render();
    scrollTalk();
    state.room.conversation = await window.papers.say(room.id, text);
    state.thinking = false;
    render();
    scrollTalk();
  });
}

// ---- Guarded note action ---------------------------------------------------

function renderGuard() {
  const g = state.guard;
  if (!g) return '';
  const items = g.items
    .map(
      (i) => `
      <div class="preview-item">
        <span class="thing-name">${esc(i.displayName)} <span class="preview-detail">· ${esc(i.type)}, ${esc(i.status)}</span></span>
        <span class="thing-path">${esc(i.path)}</span>
        <span class="preview-detail">${esc(i.detail)}</span>
      </div>`
    )
    .join('');
  return `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal">
        <div class="modal-head">
          <h2>Write a room note?</h2>
          <button class="quiet" id="modal-close">Cancel</button>
        </div>
        <div class="modal-body">This will read the following real items and share exactly this much with the AI, which will write one note into this room:
${items}</div>
        <div class="modal-foot">
          <span class="note-origin">Nothing on your machine is changed. The note will be kept by Papers, marked as AI-made.</span>
          <button class="primary" id="guard-confirm">Read these and write the note</button>
        </div>
      </div>
    </div>`;
}

function wireGuard() {
  const backdrop = document.getElementById('modal-backdrop');
  if (!backdrop) return;
  const close = () => {
    state.guard = null;
    render();
  };
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  document.getElementById('modal-close').addEventListener('click', close);
  document.getElementById('guard-confirm').addEventListener('click', async () => {
    const { thingIds } = state.guard;
    state.guard = null;
    state.thinking = true;
    render();
    const result = await window.papers.createNote(state.roomId, thingIds);
    state.thinking = false;
    if (result.activity) state.room.activity = result.activity;
    if (result.ok) {
      state.room.artifacts = result.artifacts;
      state.selectedThings = new Set();
      state.inlineError = null;
      openNoteSurface(result.artifact.id);
      return;
    }
    state.inlineError = { scope: 'notes', text: result.error };
    render();
  });
}

// ---- Shared ---------------------------------------------------------------

function scrollTalk() {
  const el = document.getElementById('talk-scroll');
  if (el) el.scrollTop = el.scrollHeight;
}

function render() {
  if (state.view === 'world') renderWorld();
  else renderRoom();
}

loadWorld();
