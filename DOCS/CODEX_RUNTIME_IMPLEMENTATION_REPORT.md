# Codex Runtime Broker — Implementation Report

## 1. Executive summary

Papers now has a production-ready first version of its Codex integration layer
(`app/codex/`), implementing every verified Gate A finding: a dedicated isolated
`CODEX_HOME` with reported-home verification, explicit `gpt-5.4-mini` pinning +
verification, structured App Server lifecycle, approval-before-action with
denial enforcement, requested-vs-effective sandbox authority, event correlation
+ deduplication, truthful terminal reporting, credential-safe logging, a
fail-closed network policy, exact-PID shutdown supervision, conservative
(protocol-level-only) cancellation, and a UI-visible runtime + approval surface.
All 86 tests pass (56 new + 30 pre-existing) and the bounded live smoke test
returned **PASS**.

## 2. Protected-repository bootstrap verification

`REAL2` verified read-only before and after: branch `backpack-note-revision`,
HEAD `16fbb3baaf1dcc10520e1f35b18cb55a741e2a9d`, sole unstaged file
`app/main.js` with patch ID `e7d6e1c2cf1a15694967c32fe3f6913e5a4899ff`. No
protected-repo mutation occurred.

## 3. Existing `app/main.js` patch preservation

The bootstrap patch (single-instance guard `app.quit()` → `app.exit(1)`) was
exported, its patch ID confirmed, applied inside the new worktree, and
re-confirmed identical. The broker changes to `main.js` are additive and
elsewhere in the file; the bootstrap line remains intact.

## 4. Files added and modified

**Added (`app/codex/`):** `CodexRuntimeBroker.js`, `AppServerTransport.js`,
`CodexHomeManager.js`, `CodexAuthManager.js`, `ApprovalCoordinator.js`,
`ExecutionPolicy.js`, `NetworkIsolationGate.js`, `EventJournal.js`,
`EventReducer.js`, `ProcessSupervisor.js`, `ThreadSessionManager.js`,
`RuntimeStateMachine.js`, `CodexErrors.js`, `config.js`, `ipc.js`,
`protocol/{constants,paths,redact,validators}.js`,
`testing/{FakeAppServer,transcripts}.js`.
**Added (UI):** `app/ui/codex-panel.js`.
**Added (tests):** `app/test/codex/{paths,redact,validators,reducer,approval,
policy}.test.js`, `broker.integration.test.js`.
**Added (scripts):** `app/scripts/codex-live-smoke.js`.
**Added (docs):** `DOCS/CODEX_RUNTIME_{BROKER,SECURITY,OPERATIONS}.md`, this
report.
**Modified:** `app/main.js` (require + register broker IPC + before-quit
shutdown), `app/preload.js` (`papersCodex` bridge), `app/ui/index.html` (panel
script tag), `app/ui/style.css` (panel styles).

## 5. Architecture implemented

See `DOCS/CODEX_RUNTIME_BROKER.md`. One trusted orchestrator composes small,
single-responsibility modules; the renderer talks only through a narrow,
validated IPC surface.

## 6. IPC changes

Nine `codex:*` invoke handlers (all input-validated, unknown fields rejected)
and five `codex:event:*` sanitized pushes. No process spawning, executable path,
credential file, raw stdin, arbitrary `command/exec`, or arbitrary RPC method is
reachable from the renderer.

## 7. UI changes

A fixed runtime panel shows state, model, PID, requested/effective sandbox,
network policy, isolation status, and pending approvals. Approval cards render
sanitized details as text only (no `innerHTML`), mark inside/outside/unknown
boundary, warn on outside/read-only/no-isolation, and always offer **Deny**
(primary for outside actions). **Approve once** is disabled with an explanatory
tooltip while acceptance is unverified. Buttons disable after one decision;
focus starts on Deny.

## 8. Security decisions

Dedicated home + verification; effective sandbox authoritative; deep value-based
redaction on every outbound path; renderer isolation preserved
(`contextIsolation` on, `nodeIntegration` off); workspace boundary via
canonical paths, never textual prefix; unknown safety-relevant server requests
fail closed. See `DOCS/CODEX_RUNTIME_SECURITY.md`.

## 9. Network fail-closed behavior

`networkAccess:false` is never treated as enforcement. Offline-required tasks are
refused with `NETWORK_ISOLATION_UNAVAILABLE` before any server request while the
provider is `Unavailable`. Command-string scanning is not used as a boundary.

## 10. Approval handling

Correlated by thread/turn/item/request IDs; one pending record + one event per
request; duplicate/stale decisions rejected; `deny → {decision:"decline"}`
(verified); `approveOnce → {decision:"accept"}` only when the acceptance flag is
on (default off).

## 11. Cancellation behavior

`turn/interrupt` is implemented behind a capability boundary. Success is claimed
only on terminal protocol evidence; otherwise `cancelledProtocolLevelOnly` /
`CANCEL_UNVERIFIED`. No descendant-process cleanup guarantee is claimed.

## 12. Thread-resume behavior

Disabled by default. Papers persists only its own thread metadata. When enabled
experimentally it calls the exact schema method and reports `no rollout found`
truthfully; it never substitutes a different thread.

## 13. Test inventory

- `paths.test.js` — normalization, extended-length, case, trailing sep, drive
  root, boundary sibling.
- `redact.test.js` — bearer/access/refresh/id token, JWT, API key, auth JSON,
  user-home.
- `validators.test.js` — effective sandbox (readOnly/missing/workspaceWrite),
  model verify, IPC allowlist, home guard + normalized verify.
- `reducer.test.js` — processId:null intent, declined, success needs launch,
  completed-without-launch, duplicate benign, conflicting = integrity error,
  unknown notification retained, unknown server request fails closed.
- `approval.test.js` — decline payload, duplicate/stale/unknown rejection,
  accept gated, accept when enabled, safety-closed, clearPending, no credential
  in event.
- `policy.test.js` — offline fails closed, non-offline allowed, network
  never-guaranteed wording, diagnostic allowlist, renderer exec refused.
- `broker.integration.test.js` — home verify + ready, home mismatch, model
  mismatch, outside command deny (exact decline, no launch inferred), file-change
  deny (no mutation), offline fail-closed, clean shutdown, sanitized history.

## 14. Test results

`node --test` (= `npm test`): **86 tests, 86 pass, 0 fail.** No regressions in
the pre-existing `engine`/`world` suites.

## 15. Live smoke-test result

`node app/scripts/codex-live-smoke.js`: **PASS.** One App Server, one model turn,
one command attempt. Model confirmed `gpt-5.4-mini`; exactly one approval
request; no process launch before approval; denial sent; outside target absent
at approval and after denial; turn terminal `completed`; App Server exited
cleanly (not forced).

## 16. Credential cleanup result

The bounded live test copied only `auth.json` into a disposable home, never read
it, and removed the home in a `finally` path (`bridgeHomeRemoved: true`). A
repository-wide scan of authored files found no credential material.

## 17. Remaining limitations

Network isolation is not enforced by the runtime sandbox; `workspace-write`
downgrades to `readOnly`; cancellation orphan-cleanup and cross-instance resume
are unproven (both disabled/limited); approval **acceptance** is unproven and
disabled by default. The global-home setup-refresh root cause is unidentified.

## 18. Recommended next gate

**Gate B** — process-tree supervision and descendant cleanup on Windows, plus a
verified outer network-isolation provider. Separately, a **harmless approval-
acceptance** live test (one extra model turn) is required before enabling
`approvalAcceptEnabled`.

## 19. Commit inventory

See the branch log. Intentional commits (≤4): broker + safety policy; approval
+ runtime UI; protocol/safety tests; security/operations docs.

## 20. Branch name and final HEAD

Branch `agent/codex-runtime-broker-v1-20260711`. Final HEAD recorded in the task
response after push.
