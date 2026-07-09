'use strict';

// The renderer's view of Papers. Everything is named in Papers terms —
// world, room, thing, note — and maps 1:1 onto the main-process handlers.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('papers', {
  getWorld: () => ipcRenderer.invoke('world:get'),
  createRoom: (title) => ipcRenderer.invoke('world:createRoom', title),
  getRoom: (roomId) => ipcRenderer.invoke('room:get', roomId),
  renameRoom: (roomId, title) => ipcRenderer.invoke('room:rename', roomId, title),
  attachThings: (roomId, kind) => ipcRenderer.invoke('room:attachThings', roomId, kind),
  detachThing: (roomId, thingId) => ipcRenderer.invoke('room:detachThing', roomId, thingId),
  openThing: (roomId, thingId) => ipcRenderer.invoke('room:openThing', roomId, thingId),
  say: (roomId, text) => ipcRenderer.invoke('room:say', roomId, text),
  notePreview: (roomId, thingIds) => ipcRenderer.invoke('room:notePreview', roomId, thingIds),
  createNote: (roomId, thingIds) => ipcRenderer.invoke('room:createNote', roomId, thingIds),
});
