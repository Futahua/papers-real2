'use strict';

// Turns the raw event stream into truthful logical state. The hard-won Gate A
// lessons live here:
//   * item/started with processId:null is INTENT, not a process launch.
//   * a duplicate item/completed for the same item id is one action, not two.
//   * conflicting duplicate terminal data is a protocol-integrity failure — we
//     never guess which is right.
//   * an unknown *safety-relevant* server request fails closed.

const { SERVER_NOTIFICATION, APPROVAL_REQUESTS, SERVER_REQUEST } = require('./protocol/constants');

// Terminal command/item statuses.
const TERMINAL_STATUS = new Set(['completed', 'failed', 'declined', 'cancelled', 'canceled']);

class EventReducer {
  constructor() {
    this.reset();
  }

  reset() {
    this.turnStatus = null; // completed | failed | ... from turn/completed
    this.items = new Map(); // itemId -> logical item record
    this.protocolIntegrityError = null;
    this.duplicateCompletions = []; // {itemId, seq}
    this.unknownEvents = []; // {method, kind}
    this.processLaunchProven = false; // any non-null processId seen
    this.lastProcessId = null;
    this.safetyEvent = null; // set when an unknown safety-relevant request seen
  }

  // Classify a server-initiated request. Returns:
  //   'approval'      -> a known approval request (command/file-change)
  //   'safety-closed' -> unknown/other server request: must be denied + flagged
  classifyServerRequest(method) {
    if (APPROVAL_REQUESTS.includes(method)) return 'approval';
    // Any other server-initiated request is safety-relevant by default.
    const known = Object.values(SERVER_REQUEST).includes(method);
    if (!known) {
      this.unknownEvents.push({ method, kind: 'server-request' });
    }
    this.safetyEvent = this.safetyEvent || method;
    return 'safety-closed';
  }

  // Feed a notification. Returns a small delta describing what changed, so the
  // broker can drive UI without re-scanning everything.
  applyNotification(msg) {
    const method = msg.method;
    const params = msg.params || {};
    const item = params.item;

    if (!SERVER_NOTIFICATION.has(method)) {
      // Unknown notification: retain, do not act, do not silently drop.
      this.unknownEvents.push({ method, kind: 'notification' });
      return { kind: 'unknown-notification', method };
    }

    if (item && item.processId != null) { this.processLaunchProven = true; this.lastProcessId = item.processId; }

    if (item && method === 'item/started') {
      if (!this.items.has(item.id)) {
        this.items.set(item.id, {
          id: item.id, type: item.type,
          started: true, completed: false, status: null,
          exitCode: null, processId: item.processId != null ? item.processId : null,
          // Gate A truth: started with null processId is intent, not launch.
          launchProven: item.processId != null,
          completionCount: 0,
        });
      }
      return { kind: 'item-started', itemId: item.id, itemType: item.type };
    }

    if (item && method === 'item/completed') {
      const rec = this.items.get(item.id) || {
        id: item.id, type: item.type, started: false, completed: false,
        status: null, exitCode: null, processId: null, launchProven: false, completionCount: 0,
      };
      rec.completionCount += 1;
      const newStatus = item.status != null ? item.status : rec.status;
      const newExit = item.exitCode !== undefined ? item.exitCode : rec.exitCode;
      if (rec.completed) {
        // Duplicate completion. Benign only if terminal data matches.
        this.duplicateCompletions.push({ itemId: item.id });
        const conflict = rec.status !== newStatus ||
          (rec.exitCode != null && newExit != null && rec.exitCode !== newExit);
        if (conflict && !this.protocolIntegrityError) {
          this.protocolIntegrityError = {
            itemId: item.id, previous: rec.status, now: newStatus,
          };
        }
        this.items.set(item.id, rec);
        return { kind: 'duplicate-completion', itemId: item.id, conflict };
      }
      rec.completed = true;
      rec.status = newStatus;
      rec.exitCode = newExit;
      if (item.processId != null) { rec.processId = item.processId; rec.launchProven = true; }
      this.items.set(item.id, rec);
      return { kind: 'item-completed', itemId: item.id, status: rec.status, exitCode: rec.exitCode };
    }

    if (method === 'turn/completed') {
      this.turnStatus = ((params.turn || {}).status) || null;
      return { kind: 'turn-completed', status: this.turnStatus };
    }
    if (method === 'turn/started') return { kind: 'turn-started' };
    if (method === 'error') return { kind: 'error', params };
    return { kind: 'other', method };
  }

  // Truthful terminal verdict for a single command item.
  commandOutcome(itemId) {
    const rec = this.items.get(itemId);
    if (!rec) return { outcome: 'unknown', reason: 'no such item' };
    if (this.protocolIntegrityError && this.protocolIntegrityError.itemId === itemId) {
      return { outcome: 'protocol-integrity-error' };
    }
    if (!rec.completed) return { outcome: 'in-progress', launchProven: rec.launchProven };
    if (rec.status === 'declined') return { outcome: 'declined' };
    if (rec.status === 'cancelled' || rec.status === 'canceled') return { outcome: 'cancelled' };
    if (rec.status === 'completed' && rec.exitCode === 0 && rec.launchProven) {
      return { outcome: 'succeeded', exitCode: 0 };
    }
    if (rec.status === 'completed' && !rec.launchProven) {
      // Completed but no process ever launched: never call this success.
      return { outcome: 'completed-without-launch' };
    }
    if (rec.status === 'failed' || (rec.exitCode != null && rec.exitCode !== 0)) {
      return { outcome: 'failed', exitCode: rec.exitCode };
    }
    return { outcome: 'unknown-terminal', status: rec.status };
  }

  snapshot() {
    return {
      turnStatus: this.turnStatus,
      itemCount: this.items.size,
      duplicateCompletions: this.duplicateCompletions.length,
      unknownEvents: this.unknownEvents.slice(),
      protocolIntegrityError: this.protocolIntegrityError,
      processLaunchProven: this.processLaunchProven,
      safetyEvent: this.safetyEvent,
    };
  }
}

module.exports = { EventReducer, TERMINAL_STATUS };
