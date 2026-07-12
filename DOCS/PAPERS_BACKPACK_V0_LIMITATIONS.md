# Papers Backpack v0 Limitations

Backpack v0 experimental vertical slice

Supported patches are ordinary unified textual edits to existing regular files and new regular text files. Binary patches, deletions, renames, copies, mode changes, executable changes, malformed or empty patches, conflicting duplicate sections, unsafe Windows paths, alternate data streams, devices, symlinks, junctions, reparse escapes, and submodule boundaries are rejected.

The target must be an already-created disposable linked Git worktree. Any existing staged, unstaged, or untracked change causes refusal. Locks are process-local, not durable leases. Receipts are memory-only. Post-apply integrity failure is reported without automatic destructive rollback. Provider approval acceptance, durable persistence, Job Object supervision, trusted network isolation, cross-instance resume, packaging, and production readiness are outside this slice.

## Deadline interpretation

These limitations are consciously accepted for the July 12 private creator build. Source-run operation is acceptable; in-memory receipts are acceptable; one active task is acceptable; disposable worktrees are mandatory; and provider approval acceptance remains disabled. Unresolved network isolation prevents arbitrary provider command execution but does not block the Papers-owned reviewed-patch flow. Any limitation that breaks the defined acceptance flow becomes a blocker; other limitations remain post-v0 work.

The launcher does not persist selected worktrees or sign-in state beyond what Codex stores inside the dedicated Papers home. Login is completed in a creator-controlled PowerShell window using a fixed copied device-auth command because Papers does not capture terminal authentication output. Worktree selection is native and must pass the same strict linked-worktree safety inspection used by patch application. Live creator-machine acceptance is still pending; these constraints remain acceptable only if that complete flow passes repeatably.

## 2026-07-12 live acceptance verdict

The 2026-07-12 live acceptance run concluded **BLOCKED** (see `PAPERS_BACKPACK_V0_ACCEPTANCE.md`): the runtime, sign-in, worktree validation, and task launch all worked, but `gpt-5.4-mini` returned the requested patch as plain agent-message text in every turn and never emitted a structured `fileChange` approval request, so nothing reached the capture/deny/apply path. Papers does not parse patch text out of chat messages; that boundary is intentional and remains.

## 2026-07-12 proposal-only mode limitations

Proposal-only mode (`PAPERS_BACKPACK_V0_PROPOSAL_MODE.md`) accepts a provider final message only when it is exactly one nonce-bound `papers.patch-proposal.v1` JSON object whose diff passes the full Papers validator — arbitrary chat patch text is still never reinterpreted as a provider action. Its first live acceptance concluded **BLOCKED**: `gpt-5.4-mini` twice produced a diff with a serialization defect (missing `diff --git` header; missing final trailing newline). Bounded terminal-LF transport canonicalization was then added — provider-message mode only, after all strict checks, appending exactly one LF when the nonempty diff lacks it, with no other repair and `validateUnifiedDiff` left strict for every other caller — and the **final run PASSED** at `d15aca17` (see `PAPERS_BACKPACK_V0_PROPOSAL_MODE.md`). Message proposals remain single-turn, in-memory, and require a completed turn, a clean disposable linked worktree, and explicit creator review before Papers applies anything; the original structured fileChange path is still BLOCKED for this provider/model, provider approval acceptance remains disabled, and the release candidate is source-run and not production-ready.
