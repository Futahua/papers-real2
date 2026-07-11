'use strict';

// Tracks App Server process lifecycle and attributable command PIDs, and
// performs conservative liveness checks. It NEVER kills by process name and
// never touches an unrelated process — only the exact attributable PID, and
// only as a recorded last resort.

class ProcessSupervisor {
  constructor() {
    this.appServer = null; // { pid, startedAt, exitedAt, exitCode, stdinClosedNormally, forcedTermination }
    this.commandPids = new Set(); // attributable child PIDs the server reported
  }

  registerAppServer(snapshot) { this.appServer = snapshot; }
  updateAppServer(snapshot) { this.appServer = snapshot; }

  noteCommandPid(pid) {
    if (pid != null && Number.isFinite(pid)) this.commandPids.add(pid);
  }

  // Is a given PID currently alive? Uses signal 0 (no actual signal sent).
  static isAlive(pid) {
    if (pid == null || !Number.isFinite(pid)) return false;
    try { process.kill(pid, 0); return true; }
    catch (e) { return e && e.code === 'EPERM'; } // EPERM => exists but not ours
  }

  // Emergency cleanup of exactly one attributable PID. Recorded by the caller
  // as a failure of graceful shutdown. Returns whether the kill was attempted.
  static forceKillExact(pid) {
    if (pid == null || !Number.isFinite(pid)) return false;
    try { process.kill(pid); return true; } catch { return false; }
  }

  snapshot() {
    return {
      appServer: this.appServer,
      attributableCommandPids: Array.from(this.commandPids),
    };
  }
}

module.exports = { ProcessSupervisor };
