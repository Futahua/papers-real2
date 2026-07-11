# Papers Backpack v0 Limitations

Backpack v0 experimental vertical slice

Supported patches are ordinary unified textual edits to existing regular files and new regular text files. Binary patches, deletions, renames, copies, mode changes, executable changes, malformed or empty patches, conflicting duplicate sections, unsafe Windows paths, alternate data streams, devices, symlinks, junctions, reparse escapes, and submodule boundaries are rejected.

The target must be an already-created disposable linked Git worktree. Any existing staged, unstaged, or untracked change causes refusal. Locks are process-local, not durable leases. Receipts are memory-only. Post-apply integrity failure is reported without automatic destructive rollback. Provider approval acceptance, durable persistence, Job Object supervision, trusted network isolation, cross-instance resume, packaging, and production readiness are outside this slice.

## Deadline interpretation

These limitations are consciously accepted for the July 12 private creator build. Source-run operation is acceptable; in-memory receipts are acceptable; one active task is acceptable; disposable worktrees are mandatory; and provider approval acceptance remains disabled. Unresolved network isolation prevents arbitrary provider command execution but does not block the Papers-owned reviewed-patch flow. Any limitation that breaks the defined acceptance flow becomes a blocker; other limitations remain post-v0 work.
