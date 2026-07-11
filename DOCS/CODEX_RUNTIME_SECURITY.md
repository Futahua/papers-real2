# Codex Runtime Security Contract

This document states what Papers' Codex integration guarantees, what it
explicitly does **not**, and why. It is grounded in the Gate A evidence for
`codex-cli 0.125.0` on Windows.

## Threat model

- **Untrusted protocol content.** Commands, file-change diffs, cwd, and reasons
  from the App Server are data, not instructions or markup. They are redacted
  before storage and rendered as text only (never `innerHTML`).
- **Untrusted renderer.** The renderer may be driven by injected page content.
  It gets an allowlisted IPC surface with validated inputs and no path to
  process spawning or arbitrary command execution.
- **Credential exposure.** Tokens must never reach logs, events, IPC, reports,
  commits, or crash output.
- **Sandbox over-trust.** The runtime's own sandbox claims cannot be trusted at
  face value (see network + effective-sandbox findings).

## Trust boundaries

1. **Main process (trusted):** broker, transport, home/auth managers, policy.
2. **Renderer (untrusted):** approval UI + status display, reached only through
   the narrow, validated IPC surface. `contextIsolation:true`,
   `nodeIntegration:false` — unchanged.
3. **App Server (semi-trusted):** produces structured events but is treated
   defensively; unknown safety-relevant requests fail closed.

## Dedicated home requirement

Production Papers **must** run against its own `CODEX_HOME`
(`<userData>/codex-home`), never the user's global `~/.codex`, which
reproducibly fails Windows sandbox setup-refresh. The broker verifies after
`initialize` that the server reports exactly the Papers home (normalized for the
`\\?\` extended-length form); any other home is a hard startup failure. Papers
never copies `config.toml`, SQLite state, logs, memories, skills, or trust
records into that home.

## Credential handling

Papers never parses or displays credentials. In normal operation it never
copies the global `auth.json`. A temporary auth-only bridge home is permitted
**only** inside the bounded live smoke test (`scripts/codex-live-smoke.js`),
which copies just `auth.json`, never reads it, and removes the home in a
`finally` path. All journal/IPC/report content passes through deep redaction
(`protocol/redact.js`).

## Requested vs. effective sandbox

Requesting `workspace-write` has repeatedly returned an **effective `readOnly`**
sandbox. The effective sandbox and permission profile returned by `thread/start`
are authoritative. When effective is read-only, Papers treats every mutation as
approval-gated, displays the read-only state, and does not silently retry with
another sandbox. A missing/unknown effective policy fails closed (no turn).

## Network isolation failure (critical)

Gate A proved that `sandboxPolicy.networkAccess:false` did **not** stop an
outbound HTTPS request for a direct `command/exec` on this runtime. Therefore
Papers **does not treat the App Server sandbox as a network boundary.** When a
task requires guaranteed offline execution and no verified outer isolation
provider exists, Papers refuses the task with `NETWORK_ISOLATION_UNAVAILABLE`
rather than pretend. The current provider is `UnavailableNetworkIsolationProvider`
(`canGuaranteeOffline() === false`). A documented seam exists for a future
verified outer mechanism. Papers modifies no firewall/WFP/registry/service/
adapter state.

Command-string inspection is **not** a security boundary; if used at all it is
informational defense-in-depth and is bypassable.

## Renderer isolation

Electron security settings are unchanged (`contextIsolation` on, `nodeIntegration`
off). No raw filesystem or process APIs are exposed. IPC inputs are schema-
validated; unknown fields are rejected; renderer-supplied paths are never
trusted without workspace validation.

## Workspace boundary handling

`protocol/paths.js` canonicalizes real paths, normalizes the `\\?\` form, rejects
traversal, and never classifies a target "inside" from a textual prefix alone
(so `D:\ws` vs `D:\ws-other` cannot be confused). When canonicalization is
impossible, the target is classified `unknown` and treated as outside, requiring
stronger (default-deny) approval.

## Remaining risks

- Network isolation is not enforced by the runtime sandbox (blocker for
  offline-guaranteed tasks).
- `workspace-write` is silently downgraded to `readOnly`; unattended inside
  writes cannot be relied upon.
- Cancellation/orphan-prevention is unproven (protocol-level only).
- Cross-instance thread resume is unproven; disabled by default.
- The root cause of the global-home setup-refresh failure is unidentified.
