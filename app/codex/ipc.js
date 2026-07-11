'use strict';

// The narrow, typed IPC surface between the renderer and the Codex broker.
// The renderer can never reach child-process spawning, arbitrary command/exec,
// the Codex executable path, credential files, or raw RPC methods. Every input
// is validated against an allowlisted schema; unknown fields are rejected.
//
// This module is Electron-aware but the wiring (registerCodexIpc) takes ipcMain
// and a window-accessor so it composes with the existing main.js conventions.

const {
  validateStartTask, validateApprovalDecision, validateCancel,
} = require('./protocol/validators');
const { CodexRuntimeBroker } = require('./CodexRuntimeBroker');
const { classifyBoundary } = require('./protocol/paths');
const { CodexError } = require('./CodexErrors');

// Wrap a handler so any thrown CodexError/ipc rejection becomes a structured,
// credential-free error result rather than an unhandled rejection.
function guard(fn) {
  return async (...args) => {
    try { return { ok: true, value: await fn(...args) }; }
    catch (err) {
      if (err && err.toJSON) return { ok: false, error: err.toJSON() };
      if (err && err.ipcRejected) return { ok: false, error: { code: 'IPC_REJECTED', message: err.message } };
      return { ok: false, error: { code: 'UNKNOWN', message: 'Codex operation failed.' } };
    }
  };
}

// registerCodexIpc(ipcMain, getWindow, opts?) -> { broker }
function registerCodexIpc(ipcMain, getWindow, opts) {
  const broker = (opts && opts.broker) || new CodexRuntimeBroker(opts);

  // Forward broker events to the renderer as sanitized pushes.
  const send = (channel, payload) => {
    const win = getWindow && getWindow();
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  };
  broker.on('runtime-status', (s) => send('codex:event:runtimeStatus', s));
  broker.on('approval', (a) => send('codex:event:approval', a));
  broker.on('task-error', (e) => send('codex:event:taskError', e));
  broker.on('turn-completed', (t) => send('codex:event:turnCompleted', t));
  broker.on('app-server-exit', (i) => send('codex:event:appServerExit', i));

  ipcMain.handle('codex:getRuntimeStatus', guard(async () => broker.getRuntimeStatus()));
  ipcMain.handle('codex:getAuthStatus', guard(async () => broker.getAuthStatus()));
  ipcMain.handle('codex:beginAuth', guard(async () => broker.beginAuth()));
  ipcMain.handle('codex:logout', guard(async () => broker.logout()));

  ipcMain.handle('codex:startTask', guard(async (_e, raw) => {
    const input = validateStartTask(raw);
    // Boundary classification is advisory context for the renderer.
    return broker.startTask(input);
  }));

  ipcMain.handle('codex:submitApprovalDecision', guard(async (_e, raw) => {
    const { approvalId, decision } = validateApprovalDecision(raw);
    return broker.submitApprovalDecision(approvalId, decision);
  }));

  ipcMain.handle('codex:cancelTask', guard(async (_e, raw) => {
    validateCancel(raw);
    return broker.cancelTask();
  }));

  ipcMain.handle('codex:getSanitizedHistory', guard(async (_e, n) => {
    const count = Number.isFinite(n) && n > 0 ? Math.min(n, 2000) : 200;
    return broker.getSanitizedHistory(count);
  }));

  ipcMain.handle('codex:exportDiagnosticBundle', guard(async () => broker.exportDiagnosticBundle()));

  return { broker };
}

module.exports = { registerCodexIpc, guard };
