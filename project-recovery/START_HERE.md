# Papers Project Recovery — Start Here

This directory is the canonical restart point after chat loss, local-directory loss, or total machine loss. Verify all manifests before running implementation or verification work.

Papers is a provider-independent execution control plane. The protected product owns durable runs, leases, normalized events, structured input, approvals, cancellation, verification, receipts, and UI; it reuses runtimes, Git, SQLite, Electron, Job Objects, credential storage, and test frameworks.

Protected state is REAL2 / `backpack-note-revision` / `16fbb3baaf1dcc10520e1f35b18cb55a741e2a9d` with intentional unstaged `app/main.js`. The experimental broker is branch `agent/codex-runtime-broker-v1-20260711` at `4458fbc8691d28c8b66ea984fc088f77765e41d7`. Gate A is branch `relay/gate-a1-20260711` at `44c886e892b61d73797007ffdb4b795f9c6b0705`, verdict FAIL, headline `NETWORK_UNEXPECTEDLY_ALLOWED`.

The broker genuinely exists, is pushed, experimental, and unmerged. It reportedly has 86 passing tests and a bounded denial smoke PASS; those are reported implementation evidence, not independent verification. Direct App Server `command/exec` did not enforce `networkAccess:false`. The broker fails closed for offline-required work, but this is not proof of network isolation. Do not treat Codex as the trusted production reference adapter.

Read: CURRENT_STATE.json, both manifests, DECISION_LOG.md, NEXT_EXECUTION_PLAN.md, PROMPT_STATUS.md, then the evidence snapshots and the broker implementation report.
