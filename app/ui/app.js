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
  editingDescription: false,
  editingBrief: false,
  historyExpanded: false,
  thinking: false,
  guard: null, // { kind: 'note', items, thingIds } | { kind: 'desk', items, updating }
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
  // Dev/test affordance: #open-room=<id|first> jumps straight into a room.
  const m = location.hash.match(/^#open-room=(.+)$/);
  if (m && state.rooms.length && state.view === 'world') {
    location.hash = '';
    enterRoom(m[1] === 'first' ? state.rooms[0].id : m[1]);
  }
}

async function enterRoom(roomId) {
  state.view = 'room';
  state.roomId = roomId;
  state.room = await window.papers.getRoom(roomId);
  state.openNoteId = null;
  state.selectedThings = new Set();
  state.inlineError = null;
  state.historyExpanded = false;
  render();
  scrollTalk();
  const { room, things, artifacts, activity, desk } = state.room;
  console.log(
    `[papers-ui] room rendered: "${room.title}" — things=${things.length} missing=${things.filter((t) => t.status === 'missing').length} notes=${artifacts.length} pinned=${artifacts.filter((a) => a.pinned).length} deskItems=${desk.items.length} brief=${desk.brief ? 'yes' : 'no'} workingNote=${desk.workingNote ? 'yes' : 'no'} sinceEvents=${room.previousEnteredAt ? activity.filter((e) => e.at > room.previousEnteredAt).length : 'n/a'}`
  );
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
        ${r.description ? `<div class="room-card-desc">${esc(r.description.slice(0, 90))}${r.description.length > 90 ? '…' : ''}</div>` : ''}
        <div class="room-counts">${r.thingCount} thing${r.thingCount === 1 ? '' : 's'}${r.missingCount ? ` <span class="warn">(${r.missingCount} missing)</span>` : ''} · ${r.artifactCount} note${r.artifactCount === 1 ? '' : 's'}</div>
        ${r.lastActivity ? `<div class="room-counts room-last" title="${esc(r.lastActivity.text)}">${esc(r.lastActivity.text)}</div>` : ''}
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
        <div class="room-card new-room" id="new-room-card">+ New Backpack</div>
      </div>
      <form class="new-room-form" id="new-room-form" hidden>
        <input type="text" id="new-room-title" placeholder="Name this Backpack…" maxlength="80" />
        <button class="primary" type="submit">Create Backpack</button>
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
      <input type="checkbox" data-select-thing="${esc(t.id)}" ${state.selectedThings.has(t.id) ? 'checked' : ''} title="Select for a Backpack note" />
      <span class="status-dot ${esc(t.status)}" title="${esc(t.status)}"></span>
      <span class="thing-main">
        <span class="thing-name">${esc(t.displayName)} <span class="preview-detail">· ${esc(t.type)}</span></span>
        <span class="thing-path" title="${esc(t.path)}">${esc(t.path)}</span>
        ${missing}
      </span>
      ${onDesk('thing', t.id) ? '<span class="ev-gone">on the Desk</span>' : `<button class="quiet" data-desk-add="thing:${esc(t.id)}" title="Put it on the Desk — the Backpack’s active work">Put on the Desk</button>`}
      <button class="quiet" data-open-thing="${esc(t.id)}" ${t.status !== 'present' ? 'disabled title="The real item is missing"' : 'title="Open the real location on this machine"'}>Open real location</button>
      <button class="quiet" data-detach-thing="${esc(t.id)}" title="Remove the reference from this Backpack (the real item is not touched)">Remove</button>
    </div>`;
}

// Is this artifact new (or newly revised) since the previous visit?
function isNewSinceLastVisit(a) {
  const prev = state.room?.room?.previousEnteredAt;
  return Boolean(prev && (a.updatedAt || a.createdAt) > prev);
}

function onDesk(type, id) {
  return state.room.desk.items.some((i) => i.type === type && i[i.type].id === id);
}

function noteCard(a) {
  const from = (a.provenance?.sourceThings || []).map((s) => s.displayName).join(', ');
  const snippet = (a.body || '').replace(/\s+/g, ' ').slice(0, 150);
  return `
    <div class="note-card ${a.pinned ? 'pinned' : ''}" data-note="${esc(a.id)}">
      <div class="note-card-head">
        <h3>${esc(a.title)}</h3>
        <span class="note-card-tags">
          ${isNewSinceLastVisit(a) ? '<span class="new-badge">new since your last visit</span>' : ''}
          ${onDesk('note', a.id) ? '<span class="ev-gone">on the Desk</span>' : `<button class="quiet" data-desk-add="note:${esc(a.id)}" title="Put it on the Desk — the Backpack’s active work">Desk</button>`}
          <button class="quiet" data-pin-note="${esc(a.id)}" data-pinned="${a.pinned ? '1' : '0'}" title="${a.pinned ? 'Unpin from the Backpack landing' : 'Pin to the Backpack landing'}">${a.pinned ? 'Unpin' : 'Pin'}</button>
        </span>
      </div>
      <div class="note-snippet">${esc(snippet)}${a.body && a.body.length > 150 ? '…' : ''}</div>
      <div class="note-provenance">
        <span class="provenance-chip">Papers AI</span>
        ${fmtDate(a.createdAt)}${from ? ` · from ${esc(from)}` : ''}
      </div>
    </div>`;
}

// ---- Room events: navigable, honest rows -----------------------------------

const EVENT_KIND_CLASS = {
  'thing-missing': 'ev-missing',
  'note-failed': 'ev-missing',
  'thing-recovered': 'ev-good',
  'note-created': 'ev-note',
  'note-pinned': 'ev-note',
  'note-unpinned': 'ev-note',
};

function fmtTime(iso) {
  return iso ? iso.slice(11, 16) : '';
}

// One room event. If the event carries refs, it becomes a path back into
// the work it describes — and stays honest when that work has since moved
// on. Events written before refs existed render as plain lines.
function eventRow(e) {
  const actions = [];
  if (e.refs?.noteId) {
    const exists = state.room.artifacts.some((a) => a.id === e.refs.noteId);
    actions.push(
      exists
        ? `<button class="quiet" data-ev-note="${esc(e.refs.noteId)}">open note</button>`
        : '<span class="ev-gone">note no longer in this Backpack</span>'
    );
  }
  if (e.refs?.path) {
    const attached = state.room.things.some((t) => t.path === e.refs.path);
    if (!attached && e.kind !== 'thing-detached') {
      actions.push('<span class="ev-gone">no longer in this Backpack</span>');
    }
    if (e.kind !== 'thing-missing') {
      actions.push(`<button class="quiet" data-ev-path="${esc(e.refs.path)}">open real location</button>`);
    }
  }
  return `
    <div class="event-row ${EVENT_KIND_CLASS[e.kind] || ''}">
      <span class="activity-when">${fmtTime(e.at)}</span>
      <span class="event-text">${esc(e.text)}</span>
      ${actions.length ? `<span class="event-actions">${actions.join(' ')}</span>` : ''}
    </div>`;
}

function dayLabel(dayIso) {
  const today = new Date();
  const t = today.toISOString().slice(0, 10);
  const y = new Date(today.getTime() - 86400000).toISOString().slice(0, 10);
  return dayIso === t ? 'Today' : dayIso === y ? 'Yesterday' : dayIso;
}

// The room's life as a readable timeline: newest first, grouped by day,
// with an honest marker where the creator's last visit falls.
function roomTimelineHtml() {
  const { room, activity } = state.room;
  if (!activity.length) return '<div class="empty-hint">Nothing has happened here yet.</div>';
  const events = [...activity].reverse();
  const shown = state.historyExpanded ? events : events.slice(0, 12);
  const prev = room.previousEnteredAt;
  const hasNewer = prev ? shown.some((e) => e.at > prev) : false;
  let html = '';
  let currentDay = null;
  let dividerDone = false;
  for (const e of shown) {
    if (hasNewer && !dividerDone && e.at <= prev) {
      html += `<div class="visit-divider">— your last visit · ${fmtDate(prev)} —</div>`;
      dividerDone = true;
    }
    const day = e.at.slice(0, 10);
    if (day !== currentDay) {
      currentDay = day;
      html += `<div class="timeline-day">${dayLabel(day)}</div>`;
    }
    html += eventRow(e);
  }
  if (events.length > shown.length) {
    html += `<button class="quiet" id="history-toggle">Show all ${events.length} events</button>`;
  } else if (state.historyExpanded && events.length > 12) {
    html += '<button class="quiet" id="history-toggle">Show fewer</button>';
  }
  return html;
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

// The room greets you with its own state: description, an honest snapshot,
// what happened since your last visit, and the work pinned to the room.
// Everything shown here is derived from persisted world data — never an
// ephemeral claim.
function roomOverviewHtml() {
  const { room, things, artifacts, activity, conversation } = state.room;
  const missing = things.filter((t) => t.status === 'missing');
  const prev = room.previousEnteredAt;
  const sinceEvents = prev ? activity.filter((e) => e.at > prev) : [];
  const workingId = state.room.desk?.workingNote?.id;
  const pinned = artifacts
    .filter((a) => a.pinned && a.id !== workingId)
    .sort((a, b) => ((a.pinnedAt || '') < (b.pinnedAt || '') ? -1 : 1));

  let desc;
  if (state.editingDescription) {
    desc = `
      <div class="room-desc editing">
        <textarea id="desc-input" rows="3" placeholder="What is this Backpack for? What lives here?">${esc(room.description || '')}</textarea>
        <div class="section-actions">
          <button class="primary" id="desc-save">Save</button>
          <button id="desc-cancel">Cancel</button>
        </div>
      </div>`;
  } else if (room.description) {
    desc = `
      <div class="room-desc">
        <div class="room-desc-text">${esc(room.description)}</div>
        <div class="room-desc-meta">Backpack description, yours · updated ${fmtDate(room.descriptionUpdatedAt)} · <button class="quiet" id="desc-edit">edit</button></div>
      </div>`;
  } else {
    desc = `<div class="room-desc empty"><button class="quiet" id="desc-edit">Describe what this Backpack is for…</button></div>`;
  }

  const snapshot = `
    <div class="room-snapshot">${things.length} thing${things.length === 1 ? '' : 's'}${missing.length ? ` <span class="warn">(${missing.length} missing)</span>` : ''} · ${artifacts.length} note${artifacts.length === 1 ? '' : 's'} · ${activity.length} Backpack event${activity.length === 1 ? '' : 's'}${conversation.length ? ` · ${conversation.length} conversation entr${conversation.length === 1 ? 'y' : 'ies'}` : ''}</div>`;

  const missingBlock = missing.length
    ? `<div class="missing-callout">This Backpack has lost contact with ${missing.length} real thing${missing.length === 1 ? '' : 's'}: ${missing.map((t) => esc(t.displayName)).join(', ')}. Details under Things.</div>`
    : '';

  let sinceBlock = '';
  if (prev) {
    if (sinceEvents.length) {
      const shown = sinceEvents.slice(-5).reverse(); // newest first, like the timeline
      sinceBlock = `
        <div class="since-visit">
          <div class="since-title">Since your last visit (${fmtDate(prev)}):</div>
          ${shown.map(eventRow).join('')}
          ${sinceEvents.length > shown.length ? `<div class="event-row earlier">… and ${sinceEvents.length - shown.length} more, in Backpack history below.</div>` : ''}
        </div>`;
    } else {
      sinceBlock = `<div class="since-visit quiet-line">Nothing new since your last visit (${fmtDate(prev)}).</div>`;
    }
  }

  const pinnedBlock = pinned.length
    ? `<h2 class="section-title pinned-title">Pinned to this Backpack</h2>${pinned.map(noteCard).join('')}`
    : '';

  return `
    <div class="section room-overview">
      ${desc}
      ${snapshot}
      ${missingBlock}
      ${sinceBlock}
      ${pinnedBlock}
    </div>`;
}

// ---- The Desk: the Backpack's active work surface --------------------------

function deskThingRow(t) {
  return `
    <div class="thing-row desk-row">
      <span class="status-dot ${esc(t.status)}" title="${esc(t.status)}"></span>
      <span class="thing-main">
        <span class="thing-name">${esc(t.displayName)} <span class="preview-detail">· ${esc(t.type)}</span></span>
        <span class="thing-path" title="${esc(t.path)}">${esc(t.path)}</span>
        ${t.status === 'missing' ? '<span class="thing-missing-note">missing — the Desk does not pretend otherwise</span>' : ''}
      </span>
      <button class="quiet" data-open-thing="${esc(t.id)}" ${t.status !== 'present' ? 'disabled' : 'title="Open the real location"'}>Open real location</button>
      <button class="quiet" data-desk-remove="thing:${esc(t.id)}" title="Take it off the Desk (it stays in the Backpack)">Take off</button>
    </div>`;
}

function deskNoteRow(a) {
  return `
    <div class="thing-row desk-row">
      <span class="status-dot present" title="a Papers note"></span>
      <span class="thing-main">
        <span class="thing-name">${esc(a.title)} <span class="preview-detail">· note</span></span>
      </span>
      <button class="quiet" data-note-open="${esc(a.id)}">Open</button>
      <button class="quiet" data-desk-remove="note:${esc(a.id)}" title="Take it off the Desk (it stays in the Backpack)">Take off</button>
    </div>`;
}

function workingNoteCard(a) {
  const revisions = a.provenance?.revisions?.length || 0;
  const snippet = (a.body || '').replace(/\s+/g, ' ').slice(0, 180);
  return `
    <div class="note-card working ${isNewSinceLastVisit(a) ? '' : ''}" data-note="${esc(a.id)}">
      <div class="note-card-head">
        <h3>${esc(a.title)}</h3>
        <span class="note-card-tags">
          ${isNewSinceLastVisit(a) ? '<span class="new-badge">revised since your last visit</span>' : ''}
          <span class="working-chip">working note</span>
        </span>
      </div>
      <div class="note-snippet">${esc(snippet)}${a.body && a.body.length > 180 ? '…' : ''}</div>
      <div class="note-provenance">
        <span class="provenance-chip">Papers AI</span>
        last revised ${fmtDate(a.updatedAt || a.createdAt)}${revisions > 1 ? ` · ${revisions} revisions` : ''}
      </div>
    </div>`;
}

function deskSectionHtml() {
  const { desk } = state.room;
  let brief;
  if (state.editingBrief) {
    brief = `
      <div class="room-desc editing">
        <textarea id="brief-input" rows="2" placeholder="What are you working on here right now?">${esc(desk.brief || '')}</textarea>
        <div class="section-actions">
          <button class="primary" id="brief-save">Save brief</button>
          <button id="brief-cancel">Cancel</button>
        </div>
      </div>`;
  } else if (desk.brief) {
    brief = `
      <div class="room-desc">
        <div class="room-desc-text">${esc(desk.brief)}</div>
        <div class="room-desc-meta">the brief — your current focus, in your words · updated ${fmtDate(desk.briefUpdatedAt)} · <button class="quiet" id="brief-edit">edit</button></div>
      </div>`;
  } else {
    brief = `<div class="room-desc empty"><button class="quiet" id="brief-edit">Write a brief — what are you working on here right now?</button></div>`;
  }
  const things = desk.items.filter((i) => i.type === 'thing').map((i) => deskThingRow(i.thing));
  const notes = desk.items.filter((i) => i.type === 'note').map((i) => deskNoteRow(i.note));
  const canSynthesize = Boolean(desk.brief || desk.items.length);
  return `
    <div class="section desk-section">
      <h2 class="section-title">The Desk — active work</h2>
      ${brief}
      ${things.join('')}${notes.join('')}
      ${!desk.items.length ? '<div class="empty-hint">Nothing on the Desk yet. Use “Put on the Desk” on things and notes below — the Desk is what the AI treats as your active work.</div>' : ''}
      ${desk.workingNote ? workingNoteCard(desk.workingNote) : ''}
      ${inlineError('desk')}
      <div class="section-actions">
        <button class="primary" id="synthesize-desk" ${canSynthesize ? '' : 'disabled title="Put something on the Desk or write a brief first"'}>${desk.workingNote ? 'Revise the working note from the Desk' : 'Synthesize the Desk into a working note'}</button>
      </div>
    </div>`;
}

// The room's contents: overview, desk, things, notes, history. This is the
// primary surface.
function roomContentsHtml() {
  const { things, artifacts, desk } = state.room;
  const selCount = state.selectedThings.size;
  const workingId = desk.workingNote?.id;
  // Unpinned notes, newest first — revisitation order. Pinned ones live in
  // the room overview above; the working note lives on the Desk.
  const shelfNotes = artifacts
    .filter((a) => !a.pinned && a.id !== workingId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return `
    ${roomOverviewHtml()}
    ${deskSectionHtml()}
    <div class="section">
      <h2 class="section-title">Things in this Backpack</h2>
      ${things.length ? things.map(thingRow).join('') : '<div class="empty-hint">Nothing here yet. Attach real files or folders from this machine — the Backpack keeps references, the originals stay where they are.</div>'}
      ${inlineError('things')}
      <div class="section-actions">
        <button id="attach-file">+ Attach files</button>
        <button id="attach-folder">+ Attach folder</button>
        <button class="primary" id="make-note" ${selCount ? '' : 'disabled'}>Write a Backpack note from ${selCount || 'selected'} thing${selCount === 1 ? '' : 's'}</button>
      </div>
    </div>
    <div class="section">
      <h2 class="section-title">Backpack notes</h2>
      ${shelfNotes.length ? shelfNotes.map(noteCard).join('') : artifacts.length ? '<div class="empty-hint">All of this Backpack’s notes are pinned above.</div>' : '<div class="empty-hint">No notes yet. Select things above and ask for a Backpack note — what the AI writes stays here.</div>'}
      ${inlineError('notes')}
    </div>
    <div class="section">
      <h2 class="section-title">Backpack history</h2>
      ${roomTimelineHtml()}
      ${inlineError('history')}
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
        <span class="thing-name">${esc(s.displayName)} <span class="preview-detail">· ${esc(s.type)}${s.attached ? '' : ' · no longer attached to this Backpack'}</span></span>
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
      <button class="quiet" id="close-note">← Back to the Backpack</button>
      <h2 class="note-title">${esc(a.title)}</h2>
      <div class="note-provenance">
        <span class="provenance-chip">Papers AI</span>
        ${a.kind === 'working-note'
          ? `${esc(`working note · begun ${fmtDate(a.createdAt)} · last revised ${fmtDate(a.updatedAt || a.createdAt)}${(a.provenance?.revisions?.length || 0) > 1 ? ` · ${a.provenance.revisions.length} revisions` : ''}`)}`
          : `Written ${fmtDate(a.createdAt)}`}${a.provenance?.engine ? ` · via ${esc(a.provenance.engine)}` : ''}
        · <button class="quiet" data-pin-note="${esc(a.id)}" data-pinned="${a.pinned ? '1' : '0'}">${a.pinned ? 'Unpin from the Backpack landing' : 'Pin to the Backpack landing'}</button>
      </div>
      <div class="note-body">${esc(a.body)}</div>
      ${noteSourcesHtml(a)}
      <div class="note-footer">This note is a Papers artifact kept in this Backpack — not a file on your machine.</div>
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
        <h2 class="section-title">Backpack conversation</h2>
        <button class="quiet" id="talk-toggle" title="Tuck the conversation away">▸</button>
      </div>
      <div class="talk-scroll" id="talk-scroll">
        ${conversation.length ? conversation.map(talkEntry).join('') : '<div class="empty-hint">The AI is present in this Backpack and knows what it holds.</div>'}
      </div>
      ${state.thinking ? '<div class="thinking">The AI is thinking…</div>' : ''}
      <form class="talk-input" id="talk-form">
        <textarea id="talk-text" placeholder="Say something in this Backpack…"></textarea>
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
          <div class="room-identity">A Backpack in this world since ${fmtDay(room.createdAt)}</div>
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
  // Pin/unpin works wherever a note appears — overview, shelf, or open note.
  appEl.querySelectorAll('[data-pin-note]').forEach((el) => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      await window.papers.pinNote(room.id, el.dataset.pinNote, el.dataset.pinned === '0');
      await refreshRoom();
      render();
    });
  });
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
  // Room description: creator-owned durable room state.
  const descEdit = document.getElementById('desc-edit');
  if (descEdit) {
    descEdit.addEventListener('click', () => {
      state.editingDescription = true;
      render();
      const input = document.getElementById('desc-input');
      if (input) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
    });
  }
  const descSave = document.getElementById('desc-save');
  if (descSave) {
    descSave.addEventListener('click', async () => {
      const text = document.getElementById('desc-input').value;
      state.room.room = await window.papers.setRoomDescription(room.id, text);
      state.editingDescription = false;
      await refreshRoom();
      render();
    });
    document.getElementById('desc-cancel').addEventListener('click', () => {
      state.editingDescription = false;
      render();
    });
  }

  document.getElementById('attach-file').addEventListener('click', () => attach('file'));
  document.getElementById('attach-folder').addEventListener('click', () => attach('folder'));

  // Room events as paths back into work: open the note an event is about,
  // or the real location it refers to (with honest refusal if reality
  // moved on).
  appEl.querySelectorAll('[data-ev-note]').forEach((el) => {
    el.addEventListener('click', () => openNoteSurface(el.dataset.evNote));
  });
  appEl.querySelectorAll('[data-ev-path]').forEach((el) => {
    el.addEventListener('click', async () => {
      const result = await window.papers.openRealPath(el.dataset.evPath);
      if (!result.ok) {
        state.inlineError = { scope: 'history', text: result.error };
        render();
      }
    });
  });
  const historyToggle = document.getElementById('history-toggle');
  if (historyToggle) {
    historyToggle.addEventListener('click', () => {
      state.historyExpanded = !state.historyExpanded;
      render();
    });
  }

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
    state.guard = { kind: 'note', items: preview.items, thingIds: ids };
    render();
  });

  // The Desk.
  const briefEdit = document.getElementById('brief-edit');
  if (briefEdit) {
    briefEdit.addEventListener('click', () => {
      state.editingBrief = true;
      render();
      const input = document.getElementById('brief-input');
      if (input) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
    });
  }
  const briefSave = document.getElementById('brief-save');
  if (briefSave) {
    briefSave.addEventListener('click', async () => {
      state.room.desk = await window.papers.setBrief(room.id, document.getElementById('brief-input').value);
      state.editingBrief = false;
      await refreshRoom();
      render();
    });
    document.getElementById('brief-cancel').addEventListener('click', () => {
      state.editingBrief = false;
      render();
    });
  }
  appEl.querySelectorAll('[data-desk-add]').forEach((el) => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const [type, id] = el.dataset.deskAdd.split(':');
      await window.papers.deskAdd(room.id, type, id);
      await refreshRoom();
      render();
    });
  });
  appEl.querySelectorAll('[data-desk-remove]').forEach((el) => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const [type, id] = el.dataset.deskRemove.split(':');
      await window.papers.deskRemove(room.id, type, id);
      await refreshRoom();
      render();
    });
  });
  appEl.querySelectorAll('[data-note-open]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      openNoteSurface(el.dataset.noteOpen);
    });
  });
  const synthBtn = document.getElementById('synthesize-desk');
  if (synthBtn) {
    synthBtn.addEventListener('click', async () => {
      const preview = await window.papers.synthesizePreview(room.id);
      if (!preview.ok) {
        state.inlineError = { scope: 'desk', text: preview.error };
        render();
        return;
      }
      state.guard = { kind: 'desk', items: preview.items, updating: preview.updating };
      render();
    });
  }

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
  let title;
  let intro;
  let confirmLabel;
  let items;
  if (g.kind === 'desk') {
    title = g.updating ? 'Revise the working note?' : 'Write the working note?';
    intro = `This will share exactly the following with the AI, which will ${g.updating ? 'revise' : 'write'} this Backpack's working note:`;
    confirmLabel = g.updating ? 'Share these and revise the note' : 'Share these and write the note';
    items = g.items
      .map(
        (i) => `
        <div class="preview-item">
          <span class="thing-name">${esc(i.label)}</span>
          ${i.path ? `<span class="thing-path">${esc(i.path)}</span>` : ''}
          <span class="preview-detail">${esc(i.detail)}</span>
        </div>`
      )
      .join('');
  } else {
    title = 'Write a Backpack note?';
    intro = 'This will read the following real items and share exactly this much with the AI, which will write one note into this Backpack:';
    confirmLabel = 'Read these and write the note';
    items = g.items
      .map(
        (i) => `
        <div class="preview-item">
          <span class="thing-name">${esc(i.displayName)} <span class="preview-detail">· ${esc(i.type)}, ${esc(i.status)}</span></span>
          <span class="thing-path">${esc(i.path)}</span>
          <span class="preview-detail">${esc(i.detail)}</span>
        </div>`
      )
      .join('');
  }
  return `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal">
        <div class="modal-head">
          <h2>${title}</h2>
          <button class="quiet" id="modal-close">Cancel</button>
        </div>
        <div class="modal-body">${intro}
${items}</div>
        <div class="modal-foot">
          <span class="note-origin">Nothing on your machine is changed. The note will be kept by Papers, marked as AI-made.</span>
          <button class="primary" id="guard-confirm">${confirmLabel}</button>
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
    const guard = state.guard;
    state.guard = null;
    state.thinking = true;
    render();
    if (guard.kind === 'desk') {
      const result = await window.papers.synthesize(state.roomId);
      state.thinking = false;
      if (result.view) state.room = result.view;
      if (result.ok) {
        state.inlineError = null;
        openNoteSurface(result.artifact.id);
        return;
      }
      state.inlineError = { scope: 'desk', text: result.error };
      render();
      return;
    }
    const result = await window.papers.createNote(state.roomId, guard.thingIds);
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
