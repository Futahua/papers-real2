'use strict';

// Authentication status and login, always against the Papers-owned CODEX_HOME.
// Papers never parses or exposes credentials, and in normal operation never
// copies the user's global auth.json. Provider errors are classified into the
// correct auth/model/transport buckets — never mislabeled.

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { resolveCodexExecutable } = require('./CodexExecutableResolver');

const STATE = Object.freeze({
  UNKNOWN: 'unknown',
  CHECKING: 'checking',
  AUTHENTICATED: 'authenticated',
  UNAUTHENTICATED: 'unauthenticated',
  AUTHENTICATING: 'authenticating',
  FAILED: 'failed',
});

class CodexAuthManager {
  constructor(config, env, opts) {
    this.config = config;
    this.env = env; // already contains the Papers CODEX_HOME
    this.state = STATE.UNKNOWN;
    this.spawn = (opts && opts.spawn) || spawn;
    this.resolveExecutable = (opts && opts.resolveExecutable) || resolveCodexExecutable;
    this._resolvedExe = null;
  }

  // The one native executable every auth operation uses. A configured
  // absolute path that exists wins; otherwise the resolver finds the native
  // binary (PAPERS_CODEX_EXE, PATH, or the npm shim's vendored codex.exe).
  // Throws CODEX_EXECUTABLE_NOT_FOUND — never a generic failure.
  _executable() {
    if (this._resolvedExe) return this._resolvedExe;
    const configured = this.config.codexExecutable;
    if (configured && path.isAbsolute(configured) && fs.existsSync(configured) && fs.statSync(configured).isFile()) {
      this._resolvedExe = configured;
    } else {
      this._resolvedExe = this.resolveExecutable({}).path;
    }
    return this._resolvedExe;
  }

  _executableFailure(err) {
    this.state = STATE.FAILED;
    return {
      state: this.state,
      reason: (err && err.code) || 'codex-unavailable',
      message: (err && err.message) || 'The Codex executable could not be resolved.',
    };
  }

  // Run `codex login status` under the Papers home. Returns a state without
  // exposing any token. Distinguishes authenticated / unauthenticated / failed.
  async getStatus() {
    this.state = STATE.CHECKING;
    try { this._executable(); } catch (err) { return this._executableFailure(err); }
    const res = await this._run(['login', 'status'], 15000);
    const text = `${res.stdout}\n${res.stderr}`;
    if (res.error) { this.state = STATE.FAILED; return this._result('connectivity'); }
    if (/logged in|authenticated/i.test(text) && res.code === 0) {
      this.state = STATE.AUTHENTICATED; return this._result(null);
    }
    if (/not logged in|unauthenticated|401|no credentials/i.test(text) || res.code !== 0) {
      this.state = STATE.UNAUTHENTICATED; return this._result('unauthenticated');
    }
    this.state = STATE.UNKNOWN; return this._result('unknown');
  }

  _result(reason) {
    return { state: this.state, reason: reason || null };
  }

  // Device auth requires terminal-visible interaction. Papers therefore
  // constructs one fixed PowerShell command for the main process to copy to
  // the clipboard. No login output or credential material enters Papers.
  async beginAuthentication() {
    let exe;
    try { exe = this._executable(); }
    catch (err) { return this._executableFailure(err); }
    this.state = STATE.AUTHENTICATING;
    // The command creates the Papers-owned home itself before invoking codex:
    // codex refuses to run when CODEX_HOME does not exist, and the paste can
    // otherwise race the main process's own ensure().
    return {
      state: this.state,
      command: `$env:CODEX_HOME=${psQuote(this.config.codexHome)}; $null = New-Item -ItemType Directory -Force -Path $env:CODEX_HOME; & ${psQuote(exe)} login --device-auth`,
      codexHomeConfigured: true,
    };
  }

  async logout() {
    const res = await this._run(['logout'], 15000);
    this.state = res.code === 0 ? STATE.UNAUTHENTICATED : STATE.FAILED;
    return { state: this.state };
  }

  _run(args, timeoutMs) {
    let exe;
    try { exe = this._executable(); }
    catch { return Promise.resolve({ error: true, code: null, stdout: '', stderr: 'codex executable not found' }); }
    return this._runProcess(exe, args, timeoutMs, this.env);
  }

  _runProcess(executable, args, timeoutMs, env) {
    return new Promise((resolve) => {
      let child;
      try {
        child = this.spawn(executable, args, {
          env, windowsHide: true, shell: false,
        });
      } catch (err) {
        resolve({ error: true, code: null, stdout: '', stderr: (err.message || '').slice(0, 200) });
        return;
      }
      let out = '', err = '', done = false;
      const finish = (r) => { if (!done) { done = true; resolve(r); } };
      const timer = setTimeout(() => { try { child.kill(); } catch {} finish({ error: true, code: null, stdout: out, stderr: err }); }, timeoutMs);
      child.stdout.on('data', (d) => { out += d.toString(); });
      child.stderr.on('data', (d) => { err += d.toString(); });
      child.on('error', (e) => { clearTimeout(timer); finish({ error: true, code: null, stdout: out, stderr: (e.message || '').slice(0, 200) }); });
      child.on('close', (code) => { clearTimeout(timer); finish({ error: false, code, stdout: out, stderr: err }); });
    });
  }
}

function psQuote(value) { return `'${String(value).replace(/'/g, "''")}'`; }

module.exports = { CodexAuthManager, AUTH_STATE: STATE, psQuote };
