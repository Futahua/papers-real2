'use strict';

// The renderer's view of Papers. Everything is named in Papers terms —
// world, room, thing, note — and maps 1:1 onto the main-process handlers.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('papers', {
  getWorld: () => ipcRenderer.invoke('world:get'),
  createRoom: (title) => ipcRenderer.invoke('world:createRoom', title),
  getRoom: (roomId) => ipcRenderer.invoke('room:get', roomId),
  refreshRoom: (roomId) => ipcRenderer.invoke('room:refresh', roomId),
  renameRoom: (roomId, title) => ipcRenderer.invoke('room:rename', roomId, title),
  setRoomDescription: (roomId, text) => ipcRenderer.invoke('room:setDescription', roomId, text),
  pinNote: (roomId, artifactId, pinned) => ipcRenderer.invoke('room:pinNote', roomId, artifactId, pinned),
  attachThings: (roomId, kind) => ipcRenderer.invoke('room:attachThings', roomId, kind),
  detachThing: (roomId, thingId) => ipcRenderer.invoke('room:detachThing', roomId, thingId),
  openThing: (roomId, thingId) => ipcRenderer.invoke('room:openThing', roomId, thingId),
  say: (roomId, text) => ipcRenderer.invoke('room:say', roomId, text),
  notePreview: (roomId, thingIds) => ipcRenderer.invoke('room:notePreview', roomId, thingIds),
  createNote: (roomId, thingIds) => ipcRenderer.invoke('room:createNote', roomId, thingIds),
  noteSources: (roomId, artifactId) => ipcRenderer.invoke('room:noteSources', roomId, artifactId),
  noteRevisePreview: (roomId, artifactId, direction) => ipcRenderer.invoke('note:revisePreview', roomId, artifactId, direction),
  noteRevise: (roomId, artifactId, direction) => ipcRenderer.invoke('note:revise', roomId, artifactId, direction),
  openRealPath: (realPath) => ipcRenderer.invoke('world:openRealPath', realPath),
  deskAdd: (roomId, type, id) => ipcRenderer.invoke('desk:add', roomId, type, id),
  deskRemove: (roomId, type, id) => ipcRenderer.invoke('desk:remove', roomId, type, id),
  setBrief: (roomId, text) => ipcRenderer.invoke('desk:setBrief', roomId, text),
  synthesizePreview: (roomId) => ipcRenderer.invoke('desk:synthesizePreview', roomId),
  synthesize: (roomId) => ipcRenderer.invoke('desk:synthesize', roomId),
});

// The Codex runtime surface — a deliberately narrow, safety-gated bridge.
// The renderer gets exactly these operations and nothing that could spawn a
// process, run an arbitrary command, or read a credential. Every invoke maps
// 1:1 onto a validated main-process handler; every `on*` is a sanitized push.
contextBridge.exposeInMainWorld('papersCodex', {
  getRuntimeStatus: () => ipcRenderer.invoke('codex:getRuntimeStatus'),
  getAuthStatus: () => ipcRenderer.invoke('codex:getAuthStatus'),
  beginAuth: () => ipcRenderer.invoke('codex:beginAuth'),
  chooseWorkspace: () => ipcRenderer.invoke('codex:chooseWorkspace'),
  logout: () => ipcRenderer.invoke('codex:logout'),
  startTask: (input) => ipcRenderer.invoke('codex:startTask', input),
  submitApprovalDecision: (input) => ipcRenderer.invoke('codex:submitApprovalDecision', input),
  cancelTask: (input) => ipcRenderer.invoke('codex:cancelTask', input),
  getSanitizedHistory: (n) => ipcRenderer.invoke('codex:getSanitizedHistory', n),
  exportDiagnosticBundle: () => ipcRenderer.invoke('codex:exportDiagnosticBundle'),
  listPatchProposals: () => ipcRenderer.invoke('codex:listPatchProposals'),
  getPatchProposal: (proposalId) => ipcRenderer.invoke('codex:getPatchProposal', { proposalId }),
  applyPatchProposal: (proposalId) => ipcRenderer.invoke('codex:applyPatchProposal', { proposalId }),
  denyPatchProposal: (proposalId) => ipcRenderer.invoke('codex:denyPatchProposal', { proposalId }),
  listPatchReceipts: () => ipcRenderer.invoke('codex:listPatchReceipts'),
  // Event subscriptions return an unsubscribe function. Listeners receive only
  // pre-sanitized payloads from the main process.
  onRuntimeStatus: (cb) => subscribe('codex:event:runtimeStatus', cb),
  onApproval: (cb) => subscribe('codex:event:approval', cb),
  onTaskError: (cb) => subscribe('codex:event:taskError', cb),
  onTurnCompleted: (cb) => subscribe('codex:event:turnCompleted', cb),
  onAppServerExit: (cb) => subscribe('codex:event:appServerExit', cb),
  onPatch: (cb) => subscribe('codex:event:patch', cb),
});

function subscribe(channel, cb) {
  const listener = (_e, payload) => {
    try { cb(payload); } catch { /* renderer callback errors are its own */ }
  };
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}
