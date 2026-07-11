'use strict';

// Papers-owned thread metadata and the disabled-by-default resume boundary.
// Production always starts a fresh ephemeral thread. Resume is experimental,
// gated, and — when enabled — must fail truthfully on "no rollout found"
// rather than silently substitute a different thread.

const { CLIENT_METHOD } = require('./protocol/constants');
const { CodexError, CODE } = require('./CodexErrors');

class ThreadSessionManager {
  constructor(config) {
    this.config = config;
    this.resumeEnabled = !!config.threadResumeEnabled;
    this.records = new Map(); // threadId -> {threadId, workspace, model, createdAt, lastKnownStatus}
  }

  remember(meta) {
    if (!meta || !meta.threadId) return;
    this.records.set(meta.threadId, {
      threadId: meta.threadId,
      workspace: meta.workspace || null,
      model: meta.model || null,
      createdAt: meta.createdAt || new Date().toISOString(),
      lastKnownStatus: meta.lastKnownStatus || 'created',
    });
  }

  updateStatus(threadId, status) {
    const r = this.records.get(threadId);
    if (r) r.lastKnownStatus = status;
  }

  list() { return Array.from(this.records.values()); }

  // Resume is gated. When enabled, the caller performs the actual transport
  // request; this validates the outcome truthfully.
  assertResumeEnabled() {
    if (!this.resumeEnabled) {
      throw new CodexError(CODE.PROTOCOL_INTEGRITY_ERROR,
        'Thread resume is disabled in this version of Papers.', { capability: 'threadResume' });
    }
    return CLIENT_METHOD.THREAD_RESUME;
  }

  // Validate a resume result against the requested thread id. A different id or
  // a "no rollout" error is reported honestly — never masked as success.
  validateResume(requestedThreadId, result, error) {
    if (error) {
      const msg = (error.detail && JSON.stringify(error.detail)) || error.message || '';
      const noRollout = /no rollout found/i.test(msg);
      return { ok: false, reason: noRollout ? 'no-rollout' : 'resume-error', error };
    }
    const returned = (result && result.thread && result.thread.id) || null;
    if (returned !== requestedThreadId) {
      return { ok: false, reason: 'different-thread', returned };
    }
    return { ok: true, threadId: returned, cwd: result.cwd || null, model: result.model || null };
  }
}

module.exports = { ThreadSessionManager };
