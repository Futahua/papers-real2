'use strict';

// Authentication status and login, always against the Papers-owned CODEX_HOME.
// Papers never parses or exposes credentials, and in normal operation never
// copies the user's global auth.json. Provider errors are classified into the
// correct auth/model/transport buckets — never mislabeled.

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

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
  }

  // Run `codex login status` under the Papers home. Returns a state without
  // exposing any token. Distinguishes authenticated / unauthenticated / failed.
  async getStatus() {
    this.state = STATE.CHECKING;
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
    const available = await this._verifyExecutable();
    if (!available) {
      this.state = STATE.FAILED;
      return { state: this.state, reason: 'codex-unavailable' };
    }
    this.state = STATE.AUTHENTICATING;
    return {
      state: this.state,
      command: `$env:CODEX_HOME=${psQuote(this.config.codexHome)}; & ${psQuote(this.config.codexExecutable)} login --device-auth`,
      codexHomeConfigured: true,
    };
  }

  async _verifyExecutable() {
    const exe = this.config.codexExecutable;
    if (path.isAbsolute(exe)) return fs.existsSync(exe) && fs.statSync(exe).isFile();
    const finder = process.platform === 'win32' ? 'where.exe' : 'which';
    const result = await this._runProcess(finder, [exe], 5000, process.env);
    return !result.error && result.code === 0;
  }

  async logout() {
    const res = await this._run(['logout'], 15000);
    this.state = res.code === 0 ? STATE.UNAUTHENTICATED : STATE.FAILED;
    return { state: this.state };
  }

  _run(args, timeoutMs) {
    return this._runProcess(this.config.codexExecutable, args, timeoutMs, this.env);
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
