# Codex Runtime Operations

Operator guide for Papers' Codex integration on the pinned runtime.

## Expected runtime

- `codex-cli 0.125.0` exactly. Other versions are unverified.
- Model: **`gpt-5.4-mini`** (pinned). The clean-home default `gpt-5.3-codex` is
  rejected `400` for ChatGPT accounts and must not be used.

## Authentication setup

Papers authenticates against its **own** Codex home (`<userData>/codex-home`),
not the global `~/.codex`. In v1, interactive login is completed in a terminal
using that home; Papers never stores or reads credentials directly. The
`codex:getAuthStatus` IPC reports one of: `unknown`, `checking`, `authenticated`,
`unauthenticated`, `authenticating`, `failed`.

## Model configuration

`PAPERS_CODEX_MODEL` overrides the pinned model (default `gpt-5.4-mini`). Papers
always verifies the model returned by `thread/start` and refuses to start a turn
on mismatch (`MODEL_MISMATCH`).

## Diagnostics

`codex:getRuntimeStatus` / the runtime panel show: executable, App Server state
and PID, sanitized home indicator, auth state, configured + last-selected model,
requested vs. effective sandbox, effective network policy, isolation-provider
status, pending approvals, shortened thread/turn IDs, last typed error, and
clean-shutdown state. Tokens are never shown.

`codex:exportDiagnosticBundle` returns a **credential-free** bundle (already
redacted) suitable for support.

## Troubleshooting

| Symptom | Meaning | Action |
|---|---|---|
| `windows sandbox: setup refresh failed` | Global/broken home in use | Ensure the Papers dedicated home is used; never the global `~/.codex`. |
| `401 Unauthorized` (`AUTH_REQUIRED`) | Not signed in for the Papers home | Sign in to Codex for the Papers home. |
| `MODEL_UNSUPPORTED` (`400`) | Wrong model for the account | Keep the pinned `gpt-5.4-mini`. |
| Effective sandbox `readOnly` | Downgrade from requested `workspace-write` | Expected on this runtime; writes are approval-gated. |
| Pending approval stuck | Awaiting a renderer decision | Deny (always available) or, if enabled, Approve once. |
| Shutdown didn't exit | Graceful EOF timed out | Broker force-kills the exact PID and records `forcedTermination`. |
| `NETWORK_ISOLATION_UNAVAILABLE` | Offline-required task refused | No verified outer isolation; the task cannot run offline-guaranteed here. |

## Sanitized evidence export

Use `codex:exportDiagnosticBundle`. The bundle is built from already-redacted
journal records; it contains no tokens, auth JSON, or unnecessary home paths.

## Currently disabled capabilities

- **Approval acceptance** (`approvalAcceptEnabled=false`): denial is the only
  verified decision. To enable, a separate harmless **acceptance** test must
  pass on this runtime (see the implementation report); then set
  `PAPERS_CODEX_APPROVAL_ACCEPT=1`.
- **Thread resume** (`threadResumeEnabled=false`): cross-instance resume of a
  turned thread is unproven. Enable experimentally with
  `PAPERS_CODEX_THREAD_RESUME=1` only for testing.
- **Guaranteed-offline tasks**: refused until a verified outer network isolation
  provider exists.

## Environment overrides (validated)

`PAPERS_CODEX_EXE`, `PAPERS_CODEX_MODEL`, `PAPERS_CODEX_STARTUP_TIMEOUT`,
`PAPERS_CODEX_REQUEST_TIMEOUT`, `PAPERS_CODEX_TURN_TIMEOUT`,
`PAPERS_CODEX_SHUTDOWN_TIMEOUT`, `PAPERS_CODEX_MAX_STDERR`,
`PAPERS_CODEX_MAX_OUTPUT`, `PAPERS_CODEX_JOURNAL_LIMIT`,
`PAPERS_CODEX_APPROVAL_ACCEPT`, `PAPERS_CODEX_THREAD_RESUME`,
`PAPERS_CODEX_NET_PROVIDER`.

A production `CODEX_HOME` can be redirected to the global home **only** with both
`PAPERS_CODEX_HOME_DEV_OVERRIDE` and `PAPERS_ALLOW_DEV_CODEX_HOME=1` — a loud,
development-only combination.
