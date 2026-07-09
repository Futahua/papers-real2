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
