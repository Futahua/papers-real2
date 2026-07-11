'use strict';

// An in-process fake that satisfies the AppServerTransport's event contract
// WITHOUT spawning a process or touching the network. It is injected via the
// broker's transportFactory. Tests script its behavior: scripted responses to
// requests, notifications to emit, approval requests to raise, duplicate
// events, malformed lines, delays, and unexpected exit.
//
// It records every client decision so tests can assert the exact denial
// payload was sent.

const { EventEmitter } = require('node:events');

class FakeAppServer extends EventEmitter {
  // script: {
  //   initialize?: result,
  //   codexHome: string,               // what initialize reports
  //   onRequest?: (method, params) => result | { error } ,
  //   afterTurnStart?: (emit) => void, // push notifications/approvals
  // }
  constructor(script) {
    super();
    this.script = script || {};
    this.pid = 424242;
    this.startedAt = 1;
    this.exitedAt = null;
    this.exitCode = null;
    this.stdinClosedNormally = false;
    this.forcedTermination = false;
    this.decisions = []; // recorded { requestId, payload }
    this._nextServerReqId = 1000;
    this._exited = false;
  }

  start() { return this.pid; }

  supervisionSnapshot() {
    return {
      pid: this.pid, startedAt: this.startedAt, exitedAt: this.exitedAt,
      exitCode: this.exitCode, stdinClosedNormally: this.stdinClosedNormally,
      forcedTermination: this.forcedTermination, running: !this._exited,
    };
  }

  async request(method, params) {
    if (this._exited) throw new Error('server exited');
    if (method === 'initialize') {
      return this.script.initialize || { codexHome: this.script.codexHome };
    }
    if (method === 'thread/start') {
      const r = this.script.onRequest ? this.script.onRequest(method, params) : null;
      return r || {
        thread: { id: this.script.threadId || 'th_fake_1' },
        model: params.model,
        sandbox: this.script.effectiveSandbox || { type: 'readOnly', networkAccess: false },
        approvalPolicy: params.approvalPolicy,
        approvalsReviewer: 'user',
        permissionProfile: this.script.permissionProfile || null,
        cwd: params.cwd,
      };
    }
    if (method === 'turn/start') {
      const r = this.script.onRequest ? this.script.onRequest(method, params) : {};
      // Let the test drive the notification sequence.
      if (this.script.afterTurnStart) {
        // Defer so the request resolves first, mirroring real async ordering.
        setImmediate(() => this.script.afterTurnStart(this._emitter(), params));
      }
      return r || {};
    }
    if (this.script.onRequest) {
      const r = this.script.onRequest(method, params);
      if (r && r.error) { const e = new Error('rpc error'); e.rpcError = r.error; throw e; }
      return r;
    }
    return {};
  }

  notify() { /* client notifications are ignored by the fake */ }

  respond(requestId, payload) { this.decisions.push({ requestId, payload }); }

  async shutdown() {
    this.stdinClosedNormally = true;
    if (!this._exited) { this._exited = true; this.exitedAt = 2; this.exitCode = 0; this.emit('exit', { pid: this.pid, code: 0 }); }
    return { exited: true, code: 0, forced: false };
  }

  // Helper handed to the test script to push server->client traffic.
  _emitter() {
    return {
      notification: (msg) => this.emit('notification', msg),
      serverRequest: (msg) => {
        if (msg.id === undefined) msg.id = this._nextServerReqId++;
        this.emit('server-request', msg);
        return msg.id;
      },
      anomaly: (a) => this.emit('protocol-anomaly', a),
      exit: (code) => { this._exited = true; this.exitedAt = 3; this.exitCode = code; this.emit('exit', { pid: this.pid, code }); },
    };
  }
}

module.exports = { FakeAppServer };
