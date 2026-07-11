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
  validateIdentifierOnly,
} = require('./protocol/validators');
const { CodexRuntimeBroker } = require('./CodexRuntimeBroker');
const { CodexError, CODE } = require('./CodexErrors');
const { GitPatchApplier } = require('../patch/GitPatchApplier');

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
  opts = opts || {};
  const broker = (opts && opts.broker) || new CodexRuntimeBroker(opts);
  const workspaceInspector = opts.workspaceInspector || new GitPatchApplier({
    prohibitedRoots: [opts.implementationRoot, ...(opts.prohibitedPatchRoots || [])].filter(Boolean),
  });
  let trustedWorkspace = null;
  const noPayload = (raw, operation) => {
    if (raw !== undefined) { const err = new Error(`${operation} accepts no renderer payload`); err.ipcRejected = true; throw err; }
  };

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
  broker.on('patch', (p) => send('codex:event:patch', p));

  ipcMain.handle('codex:getRuntimeStatus', guard(async () => broker.getRuntimeStatus()));
  ipcMain.handle('codex:getAuthStatus', guard(async (_e, raw) => { noPayload(raw, 'getAuthStatus'); return broker.getAuthStatus(); }));
  ipcMain.handle('codex:beginAuth', guard(async (_e, raw) => {
    noPayload(raw, 'beginAuth');
    const login = await broker.beginAuth();
    if (!login || !login.command || !opts.clipboard) return { state: 'failed', copied: false, reason: login && login.reason || 'clipboard-unavailable' };
    opts.clipboard.writeText(login.command);
    return { state: 'authenticating', copied: true, instructions: 'Login command copied. Paste it into PowerShell, complete device sign-in, then check sign-in again.' };
  }));
  ipcMain.handle('codex:logout', guard(async () => broker.logout()));

  ipcMain.handle('codex:startTask', guard(async (_e, raw) => {
    const input = validateStartTask(raw);
    if (!trustedWorkspace || input.workspace !== trustedWorkspace) {
      const err = new Error('Workspace must come from the native validated worktree picker.'); err.ipcRejected = true; throw err;
    }
    const auth = await broker.getAuthStatus();
    if (!auth || auth.state !== 'authenticated') throw new CodexError(CODE.AUTH_REQUIRED, 'Codex sign-in required.');
    return broker.startTask(input);
  }));

  ipcMain.handle('codex:chooseWorkspace', guard(async (_e, raw) => {
    noPayload(raw, 'chooseWorkspace');
    if (!opts.dialog) { const err = new Error('Native folder picker is unavailable.'); err.ipcRejected = true; throw err; }
    const win = getWindow && getWindow();
    const picked = await opts.dialog.showOpenDialog(win || undefined, { title: 'Choose a clean disposable linked Git worktree', properties: ['openDirectory'] });
    if (picked.canceled || !picked.filePaths || !picked.filePaths[0]) return { canceled: true };
    const inspection = workspaceInspector.inspect(picked.filePaths[0], []);
    trustedWorkspace = inspection.worktreeRoot;
    return { workspace: inspection.worktreeRoot, branch: inspection.branch, head: inspection.head, validation: 'passed' };
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
  ipcMain.handle('codex:listPatchProposals', guard(async () => broker.listPatchProposals()));
  ipcMain.handle('codex:getPatchProposal', guard(async (_e, raw) => broker.getPatchProposal(validateIdentifierOnly(raw).proposalId)));
  ipcMain.handle('codex:applyPatchProposal', guard(async (_e, raw) => broker.applyPatchProposal(validateIdentifierOnly(raw).proposalId)));
  ipcMain.handle('codex:denyPatchProposal', guard(async (_e, raw) => broker.denyPatchProposal(validateIdentifierOnly(raw).proposalId)));
  ipcMain.handle('codex:listPatchReceipts', guard(async () => broker.listPatchReceipts()));

  return { broker };
}

module.exports = { registerCodexIpc, guard };
