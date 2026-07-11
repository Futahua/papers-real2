'use strict';

// Owns the Papers-dedicated CODEX_HOME. Production sessions must never touch
// the user's global ~/.codex (which reproducibly fails sandbox setup-refresh).
// This manager creates the isolated home, hands the environment to the
// transport, and — critically — verifies after initialize() that the server
// reports the home Papers expected, using normalized Windows path comparison.

const fs = require('node:fs');
const { samePath, normalizeWinPath } = require('./protocol/paths');
const { CodexError, CODE } = require('./CodexErrors');

class CodexHomeManager {
  constructor(config) {
    this.config = config;
    this.homePath = config.codexHome;
  }

  // Create the home directory with best-effort restrictive permissions. We
  // never copy config.toml, SQLite state, logs, memories, skills, or trust
  // records from anywhere — the home starts empty and Codex populates it.
  ensure() {
    fs.mkdirSync(this.homePath, { recursive: true });
    // Best-effort tighten (0700). On Windows chmod is largely a no-op but we
    // attempt it rather than assume; failures are non-fatal.
    try { fs.chmodSync(this.homePath, 0o700); } catch { /* best effort */ }
    return this.homePath;
  }

  // Environment for the App Server child: inherit, then force CODEX_HOME.
  childEnv(baseEnv) {
    return Object.assign({}, baseEnv || process.env, { CODEX_HOME: this.homePath });
  }

  // After initialize(), confirm the server is really using our home. Any other
  // home is a hard startup failure (fail closed) — we do not proceed against
  // an unexpected home.
  verifyReportedHome(initializeResult) {
    const reported = initializeResult && initializeResult.codexHome;
    if (!samePath(reported, this.homePath)) {
      throw new CodexError(CODE.HOME_MISMATCH,
        'The Codex runtime reported a different home than Papers configured. Papers will not run against an unexpected Codex home.',
        { expected: normalizeWinPath(this.homePath), reportedNormalized: normalizeWinPath(reported) });
    }
    return true;
  }

  // Guard used by config validation elsewhere: is this home the user's global
  // ~/.codex? Production must answer no.
  static isGlobalHome(homePath) {
    const globalHome = (process.env.USERPROFILE || process.env.HOME || '') + '\\.codex';
    return samePath(homePath, globalHome);
  }
}

module.exports = { CodexHomeManager };
