# Codex Runtime Broker

The broker is Papers' single trusted bridge to the Codex App Server. It lives
in the main process (`app/codex/`) and exposes a small, safety-gated API to the
renderer through a narrow IPC surface. Every module encodes a verified Gate A
finding; nothing here assumes a guarantee that was not proven on the pinned
runtime (`codex-cli 0.125.0`).

## Architecture

| Module | Responsibility |
|---|---|
| `CodexRuntimeBroker` | Orchestrates everything; the only object IPC talks to. |
| `AppServerTransport` | JSON-RPC over stdio; PID tracking; bounded buffers; EOF shutdown; exact-PID last-resort kill. |
| `CodexHomeManager` | Dedicated `CODEX_HOME`; verifies the reported home (normalized). |
| `CodexAuthManager` | Auth status/login against the Papers home; classifies provider errors. |
| `ApprovalCoordinator` | Correlates approvals; sends the exact decision; gates acceptance. |
| `ExecutionPolicy` | One policy engine; diagnostic allowlist; no renderer argv. |
| `NetworkIsolationGate` | Fail-closed offline policy; provider abstraction. |
| `EventJournal` | Bounded, redacted event storage; diagnostic export. |
| `EventReducer` | Turns raw events into truthful logical state. |
| `ProcessSupervisor` | Lifecycle + attributable-PID liveness; never name-based kills. |
| `ThreadSessionManager` | Papers-owned thread metadata; disabled-by-default resume. |
| `RuntimeStateMachine` | Explicit, validated runtime + turn states. |
| `protocol/*` | Constants, validators, path/redaction primitives. |
| `testing/*` | `FakeAppServer` + Gate-A-shaped transcripts for deterministic tests. |

## State machine

Runtime: `stopped → starting → (authRequired) → ready → running →
waitingForApproval → running → ready → stopping → stopped`, with `failed`
reachable from any active state. Illegal transitions are logged as sanitized
anomalies and refused — they never throw into the app.

Turn states track `created … completed | failed | declined | cancelled |
interrupted | unknownTerminal` and drive truthful terminal reporting.

## IPC contract

Renderer → main (all validated, unknown fields rejected):

`codex:getRuntimeStatus`, `codex:getAuthStatus`, `codex:beginAuth`,
`codex:logout`, `codex:startTask`, `codex:submitApprovalDecision`,
`codex:cancelTask`, `codex:getSanitizedHistory`, `codex:exportDiagnosticBundle`.

Main → renderer (sanitized pushes): `codex:event:runtimeStatus`,
`codex:event:approval`, `codex:event:taskError`, `codex:event:turnCompleted`,
`codex:event:appServerExit`.

The renderer never receives child-process spawning, arbitrary `command/exec`,
the Codex executable path, credential files, raw stdin, or arbitrary RPC.

## Event flow

1. `start()` spawns the App Server, `initialize`s, and **verifies the reported
   home** (normalized). A different home is a hard failure.
2. `startTask()` enforces the offline gate, calls `thread/start` with the pinned
   model + `workspace-write` request, **verifies the selected model**, and
   **captures the effective sandbox** (authoritative — never the request).
3. Notifications flow into the `EventReducer`; server approval requests flow into
   the `ApprovalCoordinator`.
4. The renderer decides; the coordinator sends the exact decision payload.
5. `turn/completed` yields a truthful terminal verdict.

## Approval correlation

Each approval is keyed by `approvalId` derived alongside `threadId/turnId/itemId/
requestId`. Exactly one pending record and one renderer event per request.
Duplicate or stale decisions are rejected. `deny → {decision:"decline"}` (the
verified path). `approveOnce → {decision:"accept"}` only when the acceptance
capability flag is on (default **off**, because acceptance was not proven live).

## Error taxonomy

`AUTH_REQUIRED`, `MODEL_UNSUPPORTED`, `MODEL_MISMATCH`, `SANDBOX_HOME_FAILURE`,
`NETWORK_ISOLATION_UNAVAILABLE`, `APP_SERVER_START_FAILED`, `APP_SERVER_EXITED`,
`APPROVAL_DECLINED`, `APPROVAL_PROTOCOL_ERROR`, `COMMAND_PRELAUNCH_FAILED`,
`COMMAND_FAILED`, `FILE_CHANGE_DECLINED`, `CANCEL_UNVERIFIED`,
`PROTOCOL_INTEGRITY_ERROR`, `UNKNOWN_SAFETY_EVENT`, `HOME_MISMATCH`,
`IPC_REJECTED`, `TIMEOUT`. Each is credential-free and carries small structured
detail.

## Shutdown flow

`stop()` clears pending approvals conservatively (declining anything open),
closes stdin (EOF), waits `shutdownTimeoutMs`, and only then force-kills the
**exact** App Server PID as a recorded last resort. It never kills by name and
never touches an unrelated process. `main.js` calls `stop()` on `before-quit`.
