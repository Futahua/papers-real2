# Papers-Owned Patch Application

Backpack v0 experimental vertical slice

Papers captures a structured Codex `fileChange` approval request and its authoritative broker-side diff. Provider approval acceptance remains disabled. When the creator chooses “Apply safely with Papers,” Papers sends the exact provider denial, waits for correlated declined evidence, validates the proposal independently, runs `git apply --check --whitespace=error-all`, and then applies with `git apply --whitespace=error-all` inside the selected disposable linked worktree.

The renderer supplies only proposal identifiers. It never supplies diffs, paths, Git arguments, commands, RPC methods, or approval payloads. The UI renders untrusted values as text and states that Codex will be denied.

Before application, Papers requires a clean linked worktree with stable branch, HEAD, status, and affected-file hashes. Every existing path component through the nearest existing parent is inspected; symbolic links, junctions, mount/reparse escapes, Git internals, submodules, traversal, and sibling-prefix escapes fail closed. A worktree-local in-process lock prevents overlapping Backpack v0 applications.

Receipts distinguish `providerDecision: decline` from `outcome: applied-by-papers`, include pre/post hashes and canonical patch/resulting-diff hashes, and omit credentials and avoid full local paths. Failures do not trigger destructive rollback; the disposable worktree is reported for inspection.

Codex network flags are not treated as a security boundary. The broker’s offline-required policy remains fail-closed, and this patch subsystem does not alter that Gate A conclusion.

## July 12 blitz status

The current implementation is on `agent/papers-owned-patch-v0-20260711` at `c79791797ef35c60f9222ed217109a6b2442f4af`, targeting a private creator-usable Backpack v0 by Sunday, July 12, 2026, Asia/Bangkok time. The implementing agent reported 127 passing tests. Live creator-machine acceptance remains pending. This feature is the core tomorrow vertical slice; the next task is live acceptance, not architecture expansion. It is not production-ready.
