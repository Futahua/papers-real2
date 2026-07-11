'use strict';

// Coordinates server approval requests with renderer decisions. Keyed by a
// stable approvalId derived from thread/turn/item/requestId. Guarantees:
//   * exactly one pending record and one renderer event per request;
//   * duplicate or stale renderer decisions are rejected;
//   * denial ("deny") maps to the verified {decision:"decline"} payload;
//   * "approveOnce" is gated behind a capability flag (default off) because
//     acceptance was never proven live in Gate A;
//   * an unknown safety-relevant server request fails closed (auto-declined
//     and surfaced as an error), never silently accepted.

const { redact } = require('./protocol/redact');
const { classifyBoundary } = require('./protocol/paths');
const { DECISION, SERVER_REQUEST, APPROVAL_REQUESTS } = require('./protocol/constants');
const { CodexError, CODE } = require('./CodexErrors');

class ApprovalCoordinator {
  // deps: { respond(requestId, payload), emit(event), acceptEnabled, journal }
  constructor(deps) {
    this.respond = deps.respond;
    this.emit = deps.emit || (() => {});
    this.acceptEnabled = !!deps.acceptEnabled;
    this.journal = deps.journal || null;
    this.pending = new Map(); // approvalId -> record
    this._counter = 0;
  }

  // Handle a server-initiated request. `msg` is the raw JSON-RPC request.
  // context: { threadId, turnId, workspaceRoot }
  handleServerRequest(msg, context) {
    const method = msg.method;
    const params = msg.params || {};

    // Known approval requests we can present to the user.
    if (APPROVAL_REQUESTS.includes(method)) {
      return this._openApproval(msg, method, params, context || {});
    }

    // Any other server-initiated request is safety-relevant: fail closed.
    // We still send a schema-valid decline so the server is not left hanging,
    // but we report a typed safety error and never present an "approve" path.
    this.respond(msg.id, DECISION.DECLINE);
    const err = new CodexError(CODE.UNKNOWN_SAFETY_EVENT,
      'Codex sent a request Papers does not recognize as safe to approve; it was declined automatically.',
      { method });
    this.emit({ type: 'safety-declined', method, error: err.toJSON() });
    return { safetyClosed: true, error: err };
  }

  _openApproval(msg, method, params, context) {
    const itemId = params.itemId || (params.item && params.item.id) || null;
    const approvalId = `apr_${++this._counter}`;
    const isCommand = method === SERVER_REQUEST.COMMAND_APPROVAL;
    const cwd = params.cwd || null;
    // Best-effort target extraction for boundary display (command string only).
    const boundary = context.workspaceRoot && cwd
      ? classifyBoundary(context.workspaceRoot, cwd)
      : 'unknown';

    const record = {
      approvalId,
      requestId: msg.id,
      method,
      kind: isCommand ? 'command' : 'fileChange',
      threadId: context.threadId || null,
      turnId: context.turnId || params.turnId || null,
      itemId,
      resolved: false,
      // A fully sanitized view for the renderer (no credentials, no home path).
      request: redact({
        command: params.command || null,
        commandActions: params.commandActions || null,
        cwd,
        changes: params.changes || (params.item && params.item.changes) || null,
        reason: params.reason || null,
      }),
      boundary,
    };
    this.pending.set(approvalId, record);
    if (this.journal) this.journal.append('note', { method: 'approval/opened' },
      { note: 'approval opened', threadId: record.threadId, turnId: record.turnId, itemId });

    this.emit({
      type: 'approval-request',
      approvalId,
      kind: record.kind,
      method,
      threadId: record.threadId,
      turnId: record.turnId,
      itemId,
      boundary,
      request: record.request,
      // Tell the UI whether Approve is even available.
      acceptEnabled: this.acceptEnabled,
    });
    return { approvalId, record };
  }

  // Renderer decision. decision: 'deny' | 'approveOnce'.
  submitDecision(approvalId, decision) {
    const record = this.pending.get(approvalId);
    if (!record) {
      throw new CodexError(CODE.APPROVAL_PROTOCOL_ERROR,
        'That approval is no longer pending.', { approvalId });
    }
    if (record.resolved) {
      throw new CodexError(CODE.APPROVAL_PROTOCOL_ERROR,
        'That approval was already decided.', { approvalId });
    }

    if (decision === 'deny') {
      record.resolved = true;
      record.decision = 'deny';
      this.respond(record.requestId, DECISION.DECLINE);
      this.emit({ type: 'approval-resolved', approvalId, resolution: 'denied' });
      // Keep the resolved record so a second decision is reported as
      // "already decided" (a precise protocol error) rather than "not found".
      return { resolution: 'denied' };
    }

    if (decision === 'approveOnce') {
      if (!this.acceptEnabled) {
        // Capability not verified: refuse to send an accept. Denial stays the
        // only trustworthy path. We do NOT auto-deny here — the UI simply
        // should not have offered it; treat as a protocol error.
        throw new CodexError(CODE.APPROVAL_PROTOCOL_ERROR,
          'Approval acceptance is disabled because it has not been verified on this runtime.',
          { approvalId });
      }
      record.resolved = true;
      record.decision = 'approveOnce';
      this.respond(record.requestId, DECISION.ACCEPT);
      this.emit({ type: 'approval-resolved', approvalId, resolution: 'approved' });
      return { resolution: 'approved' };
    }

    throw new CodexError(CODE.APPROVAL_PROTOCOL_ERROR,
      'Unsupported approval decision.', { decision: String(decision).slice(0, 32) });
  }

  // On terminal failure or shutdown, clear pending approvals conservatively
  // (declining anything still open so nothing is left hanging).
  clearPending(reason) {
    for (const [approvalId, record] of this.pending) {
      if (!record.resolved) {
        try { this.respond(record.requestId, DECISION.DECLINE); } catch { /* ignore */ }
        this.emit({ type: 'approval-resolved', approvalId, resolution: 'superseded', reason: reason || null });
      }
    }
    this.pending.clear();
  }

  pendingCount() {
    let n = 0;
    for (const r of this.pending.values()) if (!r.resolved) n++;
    return n;
  }
}

module.exports = { ApprovalCoordinator };
