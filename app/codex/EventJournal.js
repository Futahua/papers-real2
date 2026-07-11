'use strict';

// Bounded, sanitized, in-memory event journal. Every protocol message the
// broker sees is redacted and appended here with a monotonic sequence number.
// Storage is bounded (ring buffer) so it never grows without limit, and the
// exported diagnostic bundle is guaranteed credential-free because it is built
// from already-redacted records.

const { redact } = require('./protocol/redact');

class EventJournal {
  constructor(limit) {
    this.limit = limit && limit > 0 ? limit : 5000;
    this.seq = 0;
    this.buffer = [];
  }

  // direction: 'in' | 'out' | 'note'. message is redacted before storage.
  append(direction, message, meta) {
    const rec = {
      seq: ++this.seq,
      // timestamps come from the caller in tests for determinism; default now.
      ts: (meta && meta.ts) || new Date().toISOString(),
      direction,
      method: (message && message.method) || (meta && meta.method) || null,
      requestId: message && message.id !== undefined ? message.id : null,
      threadId: (meta && meta.threadId) || null,
      turnId: (meta && meta.turnId) || null,
      itemId: (meta && meta.itemId) || null,
      note: (meta && meta.note) || undefined,
      message: redact(message),
    };
    this.buffer.push(rec);
    if (this.buffer.length > this.limit) this.buffer.shift();
    return rec.seq;
  }

  recent(n) {
    const count = n && n > 0 ? n : this.buffer.length;
    return this.buffer.slice(-count);
  }

  // A sanitized bundle for operator diagnostics. Already redacted; no secrets.
  exportBundle() {
    return {
      exportedAt: new Date().toISOString(),
      count: this.buffer.length,
      truncated: this.seq > this.buffer.length,
      events: this.buffer.slice(),
    };
  }
}

module.exports = { EventJournal };
