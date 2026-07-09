'use strict';

// Papers renderer. Two surfaces, in Papers order: the world, then a room.
// The room is the primary surface; conversation is one region inside it.

const appEl = document.getElementById('app');

const state = {
  view: 'world', // 'world' | 'room'
  world: null,
  rooms: [],
  roomId: null,
  room: null, // { room, things, artifacts, conversation }
  selectedThings: new Set(),
  thinking: false,
  modal: null, // { kind: 'note', artifact } | { kind: 'guard', items }
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
  state.selectedThings = new Set();
  render();
  scrollTalk();
}

async function backToWorld() {
  state.view = 'world';
  state.roomId = null;
  state.room = null;
  state.modal = null;
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

// ---- Room view -----------------------------------------------------------

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
  return `
    <div class="note-card" data-note="${esc(a.id)}">
      <h3>${esc(a.title)}</h3>
      <div class="note-provenance">
        <span class="provenance-chip">Papers AI</span>
        ${fmtDate(a.createdAt)}${from ? ` · from ${esc(from)}` : ''}
      </div>
    </div>`;
}

function talkEntry(e) {
  const who = e.role === 'creator' ? 'You' : e.role === 'ai' ? 'The AI' : 'Papers';
  return `
    <div class="talk-entry ${esc(e.role)}">
      <span class="who">${who} · ${fmtDate(e.at)}</span>
      <span class="bubble">${esc(e.text)}</span>
    </div>`;
}

function renderRoom() {
  const { room, things, artifacts, conversation } = state.room;
  const selCount = state.selectedThings.size;
  appEl.innerHTML = `
    <div class="room-page">
      <div class="room-header">
        <button class="quiet back" id="back-to-world">← ${esc(state.world.name)}</button>
        <h1 class="room-title" id="room-title" title="Click to rename">${esc(room.title)}</h1>
      </div>
      <div class="room-body">
        <div class="room-contents">
          <div class="section">
            <h2 class="section-title">Things in this room</h2>
            ${things.length ? things.map(thingRow).join('') : '<div class="empty-hint">Nothing here yet. Attach real files or folders from this machine — Papers keeps references, the originals stay where they are.</div>'}
            <div class="section-actions">
              <button id="attach-file">+ Attach files</button>
              <button id="attach-folder">+ Attach folder</button>
              <button class="primary" id="make-note" ${selCount ? '' : 'disabled'}>Write a room note from ${selCount || 'selected'} thing${selCount === 1 ? '' : 's'}</button>
            </div>
          </div>
          <div class="section">
            <h2 class="section-title">Room notes</h2>
            ${artifacts.length ? artifacts.map(noteCard).join('') : '<div class="empty-hint">No notes yet. Select things above and ask for a room note — what the AI writes stays here.</div>'}
          </div>
        </div>
        <div class="room-talk">
          <h2 class="section-title talk-title">Room conversation</h2>
          <div class="talk-scroll" id="talk-scroll">
            ${conversation.length ? conversation.map(talkEntry).join('') : '<div class="empty-hint">The AI is present in this room and knows what it holds.</div>'}
          </div>
          ${state.thinking ? '<div class="thinking">The AI is thinking…</div>' : ''}
          <form class="talk-input" id="talk-form">
            <textarea id="talk-text" placeholder="Say something in this room…"></textarea>
            <button class="primary" type="submit" ${state.thinking ? 'disabled' : ''}>Send</button>
          </form>
        </div>
      </div>
    </div>
    ${renderModal()}`;

  document.getElementById('back-to-world').addEventListener('click', backToWorld);

  // Rename in place.
  const titleEl = document.getElementById('room-title');
  titleEl.addEventListener('click', () => {
    if (titleEl.querySelector('input')) return;
    const current = room.title;
    titleEl.innerHTML = `<input type="text" value="${esc(current)}" maxlength="80" />`;
    const input = titleEl.querySelector('input');
    input.focus();
    input.select();
    const commit = async () => {
      const updated = await window.papers.renameRoom(room.id, input.value);
      state.room.room = updated;
      render();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') commit();
      if (e.key === 'Escape') render();
    });
    input.addEventListener('blur', commit);
  });

  // Things.
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
      if (!result.ok) {
        state.room.conversation.push({
          id: `local_${Date.now()}`,
          role: 'status',
          text: result.error,
          at: new Date().toISOString(),
        });
      }
      render();
      scrollTalk();
    });
  });
  appEl.querySelectorAll('[data-detach-thing]').forEach((el) => {
    el.addEventListener('click', async () => {
      state.room.things = await window.papers.detachThing(room.id, el.dataset.detachThing);
      state.selectedThings.delete(el.dataset.detachThing);
      render();
    });
  });

  // Guarded note action.
  document.getElementById('make-note').addEventListener('click', async () => {
    const ids = [...state.selectedThings];
    const preview = await window.papers.notePreview(room.id, ids);
    if (!preview.ok) return;
    state.modal = { kind: 'guard', items: preview.items, thingIds: ids };
    render();
  });

  // Notes.
  appEl.querySelectorAll('[data-note]').forEach((el) => {
    el.addEventListener('click', () => {
      const artifact = state.room.artifacts.find((a) => a.id === el.dataset.note);
      state.modal = { kind: 'note', artifact };
      render();
    });
  });

  // Conversation.
  const form = document.getElementById('talk-form');
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
    state.room.conversation.push({
      id: `local_${Date.now()}`,
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

  wireModal();
}

// ---- Modals ---------------------------------------------------------------

function renderModal() {
  const m = state.modal;
  if (!m) return '';
  if (m.kind === 'note') {
    const a = m.artifact;
    const sources = (a.provenance?.sourceThings || [])
      .map((s) => `${s.displayName} (${s.path})`)
      .join('; ');
    return `
      <div class="modal-backdrop" id="modal-backdrop">
        <div class="modal">
          <div class="modal-head">
            <h2>${esc(a.title)}</h2>
            <button class="quiet" id="modal-close">Close</button>
          </div>
          <div class="modal-body">${esc(a.body)}</div>
          <div class="modal-foot">
            <span class="note-origin">Written by Papers' AI on ${fmtDate(a.createdAt)}${sources ? `, from: ${esc(sources)}` : ''}. This note is a Papers artifact kept in this room — not a file on your machine.</span>
          </div>
        </div>
      </div>`;
  }
  if (m.kind === 'guard') {
    const items = m.items
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
  return '';
}

function wireModal() {
  const backdrop = document.getElementById('modal-backdrop');
  if (!backdrop) return;
  const close = () => {
    state.modal = null;
    render();
  };
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  document.getElementById('modal-close').addEventListener('click', close);
  const confirm = document.getElementById('guard-confirm');
  if (confirm) {
    confirm.addEventListener('click', async () => {
      const { thingIds } = state.modal;
      state.modal = null;
      state.thinking = true;
      render();
      const result = await window.papers.createNote(state.roomId, thingIds);
      state.thinking = false;
      if (result.conversation) state.room.conversation = result.conversation;
      if (result.ok) {
        state.room.artifacts = result.artifacts;
        state.selectedThings = new Set();
        state.modal = { kind: 'note', artifact: result.artifact };
      }
      render();
      scrollTalk();
    });
  }
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
