# Papers-Owned Patch Application

Backpack v0 experimental vertical slice

Papers captures a structured Codex `fileChange` approval request and its authoritative broker-side diff. Provider approval acceptance remains disabled. When the creator chooses “Apply safely with Papers,” Papers sends the exact provider denial, waits for correlated declined evidence, validates the proposal independently, runs `git apply --check --whitespace=error-all`, and then applies with `git apply --whitespace=error-all` inside the selected disposable linked worktree.

The renderer supplies only proposal identifiers. It never supplies diffs, paths, Git arguments, commands, RPC methods, or approval payloads. The UI renders untrusted values as text and states that Codex will be denied.

Before application, Papers requires a clean linked worktree with stable branch, HEAD, status, and affected-file hashes. Every existing path component through the nearest existing parent is inspected; symbolic links, junctions, mount/reparse escapes, Git internals, submodules, traversal, and sibling-prefix escapes fail closed. A worktree-local in-process lock prevents overlapping Backpack v0 applications.

Receipts distinguish `providerDecision: decline` from `outcome: applied-by-papers`, include pre/post hashes and canonical patch/resulting-diff hashes, and omit credentials and avoid full local paths. Failures do not trigger destructive rollback; the disposable worktree is reported for inspection.

Codex network flags are not treated as a security boundary. The broker’s offline-required policy remains fail-closed, and this patch subsystem does not alter that Gate A conclusion.

## July 12 blitz status

The current implementation is on `agent/papers-owned-patch-v0-20260711` at `c79791797ef35c60f9222ed217109a6b2442f4af`, targeting a private creator-usable Backpack v0 by Sunday, July 12, 2026, Asia/Bangkok time. The implementing agent reported 127 passing tests. Live creator-machine acceptance remains pending. This feature is the core tomorrow vertical slice; the next task is live acceptance, not architecture expansion. It is not production-ready.

## Creator task launch

The visible Codex panel now lets the creator check isolated sign-in status, copy a fixed Papers-home device-login command, choose a native safety-validated disposable linked worktree, enter an instruction, and start one task. App Server startup is lazy and idempotent. The main process rechecks authentication and recognizes only the workspace returned by its own native picker. Provider approval acceptance remains disabled, and the existing proposal-review/decline/Papers-apply authority boundary is unchanged.

No live model turn was used to implement this launcher. The next authoritative task is the real creator-machine acceptance flow; no architecture expansion should begin first.

## 2026-07-12 live acceptance verdict

Live acceptance at `dd273a0f` concluded **BLOCKED**. The Papers-owned patch path was never exercised because the provider emitted no structured `fileChange` approval request in any turn — the model answered with apply_patch-envelope text instead. Zero proposals, zero denials, zero applications, zero receipts; the fixture worktree stayed byte-identical. Details and sanitized evidence: `PAPERS_BACKPACK_V0_ACCEPTANCE.md` and `evidence/backpack-v0-acceptance-20260712/`.

## Proposal-only companion mode

A second authority model now exists alongside this path: provider-message proposals under a strict nonce-bound JSON contract (`PAPERS_BACKPACK_V0_PROPOSAL_MODE.md`). It never claims a provider decline — receipts record `providerDecision: not-applicable` — and never calls the approval coordinator; the structured decline-before-apply path documented above is preserved unchanged and takes precedence when a real `fileChange` approval occurs. Its first 2026-07-12 live acceptance concluded **BLOCKED** on provider diff-serialization defects with zero mutation; after adding bounded terminal-LF transport canonicalization (scoped to provider-message mode, appending exactly one LF when missing, no other repair), the **final run PASSED** at `d15aca17` — one nonce-bound JSON proposal applied by Papers with a truthful `not-applicable` receipt whose hashes verify. See `evidence/backpack-v0-final-acceptance-20260712/`. The structured decline-before-apply path above remains authoritative and unchanged, and its own acceptance remains BLOCKED for this provider/model.
