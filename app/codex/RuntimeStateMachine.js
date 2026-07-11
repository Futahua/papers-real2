'use strict';

// An explicit, validated state machine for the broker runtime and for turns.
// Illegal transitions are logged as sanitized anomalies and refused — they
// never throw into the application or corrupt state. The renderer receives
// immutable snapshots.

const RUNTIME_STATES = new Set([
  'stopped', 'starting', 'authRequired', 'ready', 'running',
  'waitingForApproval', 'interrupting', 'stopping', 'failed',
]);

const RUNTIME_TRANSITIONS = {
  stopped: ['starting'],
  starting: ['ready', 'authRequired', 'failed', 'stopping'],
  authRequired: ['starting', 'ready', 'stopping', 'failed'],
  ready: ['running', 'stopping', 'failed'],
  running: ['waitingForApproval', 'ready', 'interrupting', 'stopping', 'failed'],
  waitingForApproval: ['running', 'ready', 'interrupting', 'stopping', 'failed'],
  interrupting: ['ready', 'running', 'stopping', 'failed'],
  stopping: ['stopped', 'failed'],
  failed: ['stopping', 'starting'],
};

const TURN_STATES = new Set([
  'created', 'starting', 'running', 'waitingForApproval', 'completed',
  'failed', 'declined', 'cancelled', 'interrupted', 'unknownTerminal',
]);

class RuntimeStateMachine {
  constructor(onAnomaly) {
    this.state = 'stopped';
    this.onAnomaly = onAnomaly || (() => {});
    this.history = [];
  }

  can(next) {
    return RUNTIME_STATES.has(next) && (RUNTIME_TRANSITIONS[this.state] || []).includes(next);
  }

  // Returns true on success, false on an illegal transition (which is logged).
  to(next, meta) {
    if (!this.can(next)) {
      this.onAnomaly({ kind: 'illegal-transition', from: this.state, to: next, meta: meta || null });
      return false;
    }
    this.history.push({ from: this.state, to: next });
    if (this.history.length > 200) this.history.shift();
    this.state = next;
    return true;
  }

  snapshot() { return this.state; }
}

module.exports = { RuntimeStateMachine, RUNTIME_STATES, TURN_STATES };
