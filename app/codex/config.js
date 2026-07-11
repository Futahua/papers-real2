'use strict';

// One central runtime configuration object. No magic values scattered through
// the broker. Environment overrides are explicit and validated; notably a
// production CODEX_HOME can never be redirected to the user's global home
// except through an unmistakable development-only override.

const path = require('node:path');

function bool(v, dflt) {
  if (v === undefined || v === null || v === '') return dflt;
  return /^(1|true|yes|on)$/i.test(String(v));
}
function int(v, dflt) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : dflt;
}

// userDataDir: the Electron app.getPath('userData') in production. Injected so
// the module is testable without Electron.
function buildConfig(opts) {
  opts = opts || {};
  const env = opts.env || process.env;
  const userDataDir = opts.userDataDir || env.PAPERS_USER_DATA || path.join(process.cwd(), '.papers-userdata');

  // Papers-owned Codex home. Never the global ~/.codex. A dev override exists
  // but demands an explicit, loud flag so it cannot happen by accident.
  let codexHome = path.join(userDataDir, 'codex-home');
  const devHomeOverride = env.PAPERS_CODEX_HOME_DEV_OVERRIDE;
  if (devHomeOverride && bool(env.PAPERS_ALLOW_DEV_CODEX_HOME, false)) {
    codexHome = devHomeOverride;
  }

  return Object.freeze({
    codexExecutable: env.PAPERS_CODEX_EXE || defaultCodexExe(),
    codexHome,
    // The one verified-good model. Configurable for the future, pinned today.
    model: env.PAPERS_CODEX_MODEL || 'gpt-5.4-mini',
    startupTimeoutMs: int(env.PAPERS_CODEX_STARTUP_TIMEOUT, 30000),
    requestTimeoutMs: int(env.PAPERS_CODEX_REQUEST_TIMEOUT, 30000),
    turnTimeoutMs: int(env.PAPERS_CODEX_TURN_TIMEOUT, 360000),
    shutdownTimeoutMs: int(env.PAPERS_CODEX_SHUTDOWN_TIMEOUT, 15000),
    maxStderrBytes: int(env.PAPERS_CODEX_MAX_STDERR, 65536),
    maxCommandOutputBytes: int(env.PAPERS_CODEX_MAX_OUTPUT, 131072),
    eventJournalLimit: int(env.PAPERS_CODEX_JOURNAL_LIMIT, 5000),
    // Acceptance was NOT proven in Gate A; denial was. Default closed.
    approvalAcceptEnabled: bool(env.PAPERS_CODEX_APPROVAL_ACCEPT, false),
    // Cross-instance resume unproven; default closed.
    threadResumeEnabled: bool(env.PAPERS_CODEX_THREAD_RESUME, false),
    // No verified outer network isolation provider exists yet.
    networkIsolationProvider: env.PAPERS_CODEX_NET_PROVIDER || 'unavailable',
    // Marks whether the dev home override is active — surfaced in diagnostics.
    devHomeOverrideActive: codexHome === devHomeOverride,
  });
}

function defaultCodexExe() {
  // The npm shim resolves to the native binary; on Windows the shim is a .cmd.
  // Callers may override via PAPERS_CODEX_EXE with the native exe path.
  return process.platform === 'win32' ? 'codex.cmd' : 'codex';
}

module.exports = { buildConfig };
