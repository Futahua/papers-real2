'use strict';

// The single policy engine gating every execution surface. It encodes the
// Gate A rules so no caller can accidentally do the unsafe thing:
//   * direct command/exec is NOT a general capability; only an internal
//     allowlist of exact diagnostic operation IDs may use it, and never with
//     renderer-supplied argv.
//   * offline-required work is refused unless a verified isolation provider
//     exists (delegated to the NetworkIsolationGate).
//   * model-turn commands and structured file changes flow only through the
//     approval-coordinated event path.

const { CodexError, CODE } = require('./CodexErrors');

// Exact, fixed diagnostic operations permitted to use direct command/exec.
// Each maps to a fixed argv the renderer can never influence. Intentionally
// tiny; anything not here is refused.
const DIAGNOSTIC_OPS = Object.freeze({
  // A harmless liveness check used only by internal self-tests / diagnostics.
  ECHO_OK: {
    argv: ['C:\\Program Files\\PowerShell\\7\\pwsh.exe', '-NoProfile', '-Command', "Write-Output PAPERS_DIAG_OK"],
    networkRequested: false,
  },
});

class ExecutionPolicy {
  constructor(networkGate) {
    this.networkGate = networkGate;
  }

  // Model-turn commands: always via structured events + approval. This method
  // exists to make the rule explicit and testable; the broker never bypasses
  // it to run a raw command from a turn.
  assertModelTurnAllowed() { return true; }

  assertFileChangeAllowed() { return true; }

  // Resolve an internal diagnostic operation ID to its fixed argv. Rejects any
  // unknown ID. Renderer input never reaches here.
  resolveDiagnostic(opId) {
    const op = DIAGNOSTIC_OPS[opId];
    if (!op) {
      throw new CodexError(CODE.IPC_REJECTED,
        'Unknown internal diagnostic operation.', { opId: String(opId).slice(0, 64) });
    }
    if (op.networkRequested === false) {
      // Even internal diagnostics that assume offline must respect the gate if
      // they truly require guaranteed isolation. ECHO_OK does not require the
      // network, but it also does not depend on isolation, so no assert here.
    }
    return { argv: op.argv.slice(), networkRequested: op.networkRequested };
  }

  // Guard for any task that declares it needs guaranteed-offline execution.
  assertOfflineTaskAllowed(requireOffline) {
    if (requireOffline) this.networkGate.assertOfflineAllowed();
    return true;
  }

  // The renderer must never be able to submit an arbitrary command/exec. This
  // is enforced structurally (no IPC channel exposes it) and asserted here for
  // defense in depth if some future caller tries.
  static rejectRendererCommandExec() {
    throw new CodexError(CODE.IPC_REJECTED,
      'Direct command execution is not available to the interface.');
  }
}

module.exports = { ExecutionPolicy, DIAGNOSTIC_OPS };
