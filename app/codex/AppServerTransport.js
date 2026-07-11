'use strict';

// JSON-RPC-over-stdio transport for a single Codex App Server process.
//
// Responsibilities: spawn the pinned executable, frame newline-delimited JSON
// safely, correlate request IDs, surface notifications and server-initiated
// requests to the broker, enforce timeouts, and shut down via stdin EOF with a
// bounded wait before an exact-PID last-resort kill. It never kills by name
// and never touches an unrelated process.

const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');
const { isJsonRpcMessage } = require('./protocol/validators');
const { CodexError, CODE } = require('./CodexErrors');

class AppServerTransport extends EventEmitter {
  constructor(config, env) {
    super();
    this.config = config;
    this.env = env;
    this.child = null;
    this.pid = null;
    this.nextId = 1;
    this.pending = new Map();
    this.buf = '';
    this.stderr = '';
    this.startedAt = null;
    this.exitedAt = null;
    this.exitCode = null;
    this.stdinClosedNormally = false;
    this.forcedTermination = false;
    this._exitWaiters = [];
  }

  start() {
    const args = ['app-server', '--listen', 'stdio://'];
    let child;
    try {
      child = spawn(this.config.codexExecutable, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: this.env,
        windowsHide: true,
      });
    } catch (err) {
      throw new CodexError(CODE.APP_SERVER_START_FAILED,
        'The Codex App Server could not be started on this machine.',
        { signature: (err && err.message || '').slice(0, 200) });
    }
    this.child = child;
    this.pid = child.pid;
    this.startedAt = Date.now();

    child.on('error', (err) => {
      this.emit('transport-error', new CodexError(CODE.APP_SERVER_START_FAILED,
        'The Codex App Server process errored.', { signature: (err.message || '').slice(0, 200) }));
    });
    child.stderr.on('data', (d) => {
      this.stderr += d.toString();
      if (this.stderr.length > this.config.maxStderrBytes) {
        this.stderr = this.stderr.slice(-this.config.maxStderrBytes);
      }
    });
    child.stdout.on('data', (d) => this._onStdout(d));
    child.on('exit', (code) => {
      this.exitedAt = Date.now();
      this.exitCode = code;
      // Fail every outstanding request; the app must not hang.
      for (const [, p] of this.pending) {
        p.reject(new CodexError(CODE.APP_SERVER_EXITED,
          'The Codex App Server exited before responding.', { exitCode: code }));
      }
      this.pending.clear();
      for (const w of this._exitWaiters) w({ exited: true, code });
      this._exitWaiters = [];
      this.emit('exit', { pid: this.pid, code });
    });
    return this.pid;
  }

  _onStdout(chunk) {
    this.buf += chunk.toString();
    // Bound the parse buffer to avoid unbounded growth on a misbehaving peer.
    if (this.buf.length > 8 * 1024 * 1024) {
      this.buf = this.buf.slice(-1024 * 1024);
      this.emit('protocol-anomaly', { kind: 'stdout-buffer-overflow' });
    }
    let i;
    while ((i = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, i).trim();
      this.buf = this.buf.slice(i + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); }
      catch { this.emit('protocol-anomaly', { kind: 'non-json-line' }); continue; }
      this._dispatch(msg);
    }
  }

  _dispatch(msg) {
    if (!isJsonRpcMessage(msg)) {
      // Some servers omit jsonrpc on responses; tolerate result/error shape.
      if (!(msg && (msg.result !== undefined || msg.error !== undefined || msg.method))) {
        this.emit('protocol-anomaly', { kind: 'malformed-message' });
        return;
      }
    }
    // Response to one of our requests.
    if (msg.id !== undefined && (msg.result !== undefined || msg.error !== undefined) && this.pending.has(msg.id)) {
      const p = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.error) p.reject(new CodexError(CODE.APPROVAL_PROTOCOL_ERROR,
        'The Codex App Server returned an error response.', { rpcError: safe(msg.error) }));
      else p.resolve(msg.result);
      return;
    }
    // Server-initiated request (needs a response from us).
    if (msg.id !== undefined && msg.method) {
      this.emit('server-request', msg);
      return;
    }
    // Notification.
    if (msg.method) { this.emit('notification', msg); return; }
    this.emit('protocol-anomaly', { kind: 'unclassified', });
  }

  // Send a request; resolves with result or rejects with a typed error.
  request(method, params, timeoutMs) {
    const id = this.nextId++;
    const msg = { jsonrpc: '2.0', id, method, params };
    const timeout = timeoutMs || this.config.requestTimeoutMs;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new CodexError(CODE.TIMEOUT, `Codex request "${method}" timed out.`));
        }
      }, timeout);
      this.pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
        method,
      });
      this._write(msg);
    });
  }

  notify(method, params) { this._write({ jsonrpc: '2.0', method, params }); }

  // Respond to a server-initiated request. Used only by the approval
  // coordinator with an exact schema-valid decision payload.
  respond(id, result) { this._write({ jsonrpc: '2.0', id, result }); }

  _write(obj) {
    if (!this.child || this.exitedAt) return false;
    try { this.child.stdin.write(JSON.stringify(obj) + '\n'); return true; }
    catch { return false; }
  }

  // Graceful shutdown: close stdin (EOF), wait bounded time for exit, then as
  // a recorded last resort kill the exact PID. Never a name-based kill.
  async shutdown() {
    if (this.exitedAt) return { exited: true, code: this.exitCode, forced: false };
    try { this.child.stdin.end(); this.stdinClosedNormally = true; } catch { /* ignore */ }
    const exited = await this._waitExit(this.config.shutdownTimeoutMs);
    if (exited.exited) return { exited: true, code: this.exitCode, forced: false };
    // Last resort: terminate exactly this PID.
    this.forcedTermination = true;
    try { this.child.kill(); } catch { /* ignore */ }
    const after = await this._waitExit(3000);
    return { exited: after.exited, code: this.exitCode, forced: true };
  }

  _waitExit(ms) {
    if (this.exitedAt) return Promise.resolve({ exited: true, code: this.exitCode });
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ exited: false }), ms);
      this._exitWaiters.push((info) => { clearTimeout(timer); resolve(info); });
    });
  }

  supervisionSnapshot() {
    return {
      pid: this.pid,
      startedAt: this.startedAt,
      exitedAt: this.exitedAt,
      exitCode: this.exitCode,
      stdinClosedNormally: this.stdinClosedNormally,
      forcedTermination: this.forcedTermination,
      running: !!this.child && !this.exitedAt,
    };
  }
}

function safe(o) { try { return JSON.parse(JSON.stringify(o)); } catch { return null; } }

module.exports = { AppServerTransport };
