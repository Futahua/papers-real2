'use strict';

// Response and IPC-input validators. These enforce the Gate A safety contract
// at the boundaries: the effective sandbox is authoritative (never the
// request), and renderer input is allowlisted rather than trusted.

const { SANDBOX_TYPE } = require('./constants');

// Validate the sandbox/permission profile returned by thread/start.
// Returns { ok, effectiveType, networkAccess, readOnly, profile, reason }.
// Fails closed: a missing or unrecognized policy is not treated as writable.
function validateEffectiveSandbox(threadStartResult) {
  const sandbox = threadStartResult && threadStartResult.sandbox;
  if (!sandbox || typeof sandbox !== 'object' || typeof sandbox.type !== 'string') {
    return { ok: false, effectiveType: null, readOnly: true, networkAccess: false,
      profile: threadStartResult && threadStartResult.permissionProfile ? threadStartResult.permissionProfile : null,
      reason: 'thread/start returned no recognizable effective sandbox; failing closed' };
  }
  const type = sandbox.type;
  const known = Object.values(SANDBOX_TYPE).includes(type);
  // networkAccess defaults to false unless the server explicitly says true.
  const networkAccess = sandbox.networkAccess === true;
  const readOnly = type === SANDBOX_TYPE.READ_ONLY || type !== SANDBOX_TYPE.WORKSPACE_WRITE;
  return {
    ok: known,
    effectiveType: type,
    networkAccess,
    // Under anything other than a genuine workspaceWrite we treat mutations as
    // approval-gated (readOnly-equivalent for planning purposes).
    readOnly,
    profile: threadStartResult.permissionProfile || null,
    reason: known ? null : `unrecognized effective sandbox type "${type}"; failing closed`,
  };
}

// Verify the model the server actually selected matches what we pinned.
function validateSelectedModel(threadStartResult, requestedModel) {
  const selected = threadStartResult && threadStartResult.model;
  return { ok: selected === requestedModel, selected: selected || null, requested: requestedModel };
}

// Is this a structurally valid JSON-RPC message?
function isJsonRpcMessage(m) {
  return m && typeof m === 'object' && m.jsonrpc === '2.0';
}

// --- IPC input validation -------------------------------------------------
// The renderer is untrusted. Each operation declares an exact shape; unknown
// fields are rejected where practical, and no field may carry an executable
// path, argv, or raw RPC method.

function requireString(v, name, max) {
  if (typeof v !== 'string') throw ipcError(`${name} must be a string`);
  if (max && v.length > max) throw ipcError(`${name} too long`);
  return v;
}
function ipcError(msg) {
  const e = new Error(msg);
  e.ipcRejected = true;
  return e;
}

// startTask input: a workspace path and a natural-language instruction, plus
// an optional declared network requirement. No command, no argv, no model
// override from the renderer (model is pinned in main).
function validateStartTask(input) {
  if (!input || typeof input !== 'object') throw ipcError('startTask requires an object');
  const allowed = new Set(['workspace', 'instruction', 'requireOffline']);
  for (const k of Object.keys(input)) if (!allowed.has(k)) throw ipcError(`unknown field "${k}"`);
  const workspace = requireString(input.workspace, 'workspace', 4096);
  const instruction = requireString(input.instruction, 'instruction', 20000);
  const requireOffline = input.requireOffline === true;
  return { workspace, instruction, requireOffline };
}

// approval decision: only the two allowed decisions, keyed to a request id.
function validateApprovalDecision(input) {
  if (!input || typeof input !== 'object') throw ipcError('decision requires an object');
  const allowed = new Set(['approvalId', 'decision']);
  for (const k of Object.keys(input)) if (!allowed.has(k)) throw ipcError(`unknown field "${k}"`);
  const approvalId = requireString(input.approvalId, 'approvalId', 200);
  const decision = requireString(input.decision, 'decision', 32);
  if (decision !== 'deny' && decision !== 'approveOnce') throw ipcError(`unsupported decision "${decision}"`);
  return { approvalId, decision };
}

function validateCancel(input) {
  if (!input || typeof input !== 'object') throw ipcError('cancel requires an object');
  const allowed = new Set(['taskId']);
  for (const k of Object.keys(input)) if (!allowed.has(k)) throw ipcError(`unknown field "${k}"`);
  return { taskId: requireString(input.taskId, 'taskId', 200) };
}

module.exports = {
  validateEffectiveSandbox,
  validateSelectedModel,
  isJsonRpcMessage,
  validateStartTask,
  validateApprovalDecision,
  validateCancel,
  ipcError,
};
