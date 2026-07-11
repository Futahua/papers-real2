# Papers Backpack v0 Limitations

Backpack v0 experimental vertical slice

Supported patches are ordinary unified textual edits to existing regular files and new regular text files. Binary patches, deletions, renames, copies, mode changes, executable changes, malformed or empty patches, conflicting duplicate sections, unsafe Windows paths, alternate data streams, devices, symlinks, junctions, reparse escapes, and submodule boundaries are rejected.

The target must be an already-created disposable linked Git worktree. Any existing staged, unstaged, or untracked change causes refusal. Locks are process-local, not durable leases. Receipts are memory-only. Post-apply integrity failure is reported without automatic destructive rollback. Provider approval acceptance, durable persistence, Job Object supervision, trusted network isolation, cross-instance resume, packaging, and production readiness are outside this slice.
