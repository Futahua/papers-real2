# Papers Backpack v0 — July 12 Blitz

**Delivery target:** private creator-usable Backpack v0 by Sunday, July 12, 2026, Asia/Bangkok time.

This is a deadline-driven vertical slice, not a production release. Scope is frozen until the creator-machine acceptance flow passes.

## 1. Current implementation checkpoint

branch: agent/papers-owned-patch-v0-20260711  
HEAD: c79791797ef35c60f9222ed217109a6b2442f4af  
base: 4458fbc8691d28c8b66ea984fc088f77765e41d7

commits:

- d34c6ca
- 932a51f
- c797917

The branch contains structured Codex file-change proposal capture, provider decline-before-apply, Papers-owned validation, Papers-owned `git apply`, safe path and worktree enforcement, dirty and drifted worktree refusal, process-local worktree locking, narrow Electron IPC, diff-review UI, in-memory receipts, unit and integration tests, and documentation.

Reported validation:

```text
new unit tests: 21
new integration tests: 20
total tests: 127
reported failures: 0
```

These test results were reported by the implementing agent. Live creator-machine acceptance remains the next authoritative gate.

## 2. Definition of “usable tomorrow”

Backpack v0 is usable when all of these pass on the creator’s machine:

1. Papers launches successfully from the feature worktree.
2. The user can select or configure a disposable linked Git worktree.
3. A real Codex task produces one structured textual file-change proposal.
4. Papers captures the proposal exactly once.
5. The UI displays the affected files and diff.
6. The user can choose `Apply safely with Papers`.
7. Papers sends provider denial before mutation.
8. Correlated provider denial is confirmed.
9. Papers validates and applies the patch itself.
10. Only the expected files change.
11. The resulting diff matches the reviewed proposal.
12. A truthful receipt is displayed.
13. The protected `REAL2` repository remains unchanged.
14. No credentials or temporary patch files remain.
15. The same flow can be repeated after restarting Papers, even though prior in-memory receipts may be lost.

Durable receipt history is not required for tomorrow.

## 3. Frozen tomorrow scope

Tomorrow’s private Backpack supports only:

- one creator;
- one local Windows machine;
- source-run Electron application;
- Codex as the experimental proposal provider;
- one active task at a time;
- disposable linked Git worktrees;
- ordinary textual modifications;
- new regular text files;
- mandatory human review;
- Papers-owned patch application;
- provider approval acceptance disabled;
- provider commands and mutations not trusted;
- in-memory receipts;
- explicit failure reporting.

## 4. Explicitly deferred

The following are not required for the July 12 private usable build:

- installer or distributable packaging;
- automatic updates;
- polished onboarding;
- OpenCode integration;
- multi-provider support;
- SQLite persistence;
- durable repository leases;
- durable receipts;
- cross-process locking;
- cross-instance thread resume;
- unattended execution;
- provider approval acceptance;
- arbitrary shell-command approval;
- trusted Codex network isolation;
- full Windows Job Object supervision;
- multi-user support;
- production security certification;
- automatic destructive rollback;
- comprehensive visual polish.

Deferred does not mean abandoned. These items must not block the first creator-usable Backpack unless live acceptance proves one is strictly necessary.

## 5. Stop-the-line blockers

The build must not be called usable when any of these occurs:

- Papers cannot launch;
- a real structured file-change proposal cannot be captured;
- proposal correlation is ambiguous;
- provider denial cannot be confirmed;
- mutation occurs before denial;
- renderer-supplied diffs or paths become authoritative;
- an unsafe path passes validation;
- an unexpected file changes;
- the resulting diff differs from the reviewed patch;
- the worktree is dirty or drifted and Papers continues anyway;
- receipt outcome is false or missing;
- credentials appear in logs, UI, receipts, or repository files;
- `REAL2` changes;
- temporary credential homes or patch files remain;
- the app reports success after an integrity failure.

## 6. Blitz execution order

### Gate 1 — Independent critical-path review

Read only the safety-sensitive implementation:

```text
app/patch/
app/codex/CodexRuntimeBroker.js
app/codex/ipc.js
app/codex/protocol/validators.js
app/preload.js
app/ui/codex-panel.js
```

Review only for deadline-blocking defects.

### Gate 2 — Full automated tests

From:

```text
D:\LapSlop brotherhood\Programs\Papers are papers\_agent_papers_owned_patch_v0_20260711\app
```

Run:

```text
npm test
```

The source application launches with `npm start` according to `app/package.json`. Do not add packaging before source-run acceptance.

### Gate 3 — Live creator-machine acceptance

Use a newly created disposable linked Git worktree containing a harmless tracked text fixture. Run one live Codex request that proposes one harmless textual modification. Exercise the real UI flow and capture sanitized evidence for the proposal, reviewed diff, provider denial, denial confirmation, Papers apply, final Git diff, receipt, and cleanup.

### Gate 4 — Deadline blocker fixes only

Fix only defects preventing the acceptance flow. Do not add unrelated features or architecture.

### Gate 5 — Repeat acceptance

Repeat the complete live flow after fixes. The first repeatable successful flow is the Backpack v0 release candidate.

### Gate 6 — Optional convenience

Only after acceptance passes, add a simple local launch script, improve obvious labels, or document creator startup steps. Packaging remains optional.

## 7. Tomorrow launch command

```powershell
Set-Location 'D:\LapSlop brotherhood\Programs\Papers are papers\_agent_papers_owned_patch_v0_20260711\app'
npm start
```

This is the expected private v0 startup path until packaging exists.

## 8. Honest capability statement

Backpack v0 is not an autonomous coding agent and does not trust Codex to mutate the repository. Codex proposes a textual change, the creator reviews it, Codex is denied, and Papers applies the validated patch inside a disposable worktree.

The July 12 objective is a repeatable, safe creator workflow—not production completeness.

## 9. Next task

NEXT AUTHORITATIVE TASK: independent review and live creator-machine acceptance of commit c79791797ef35c60f9222ed217109a6b2442f4af. Do not begin another feature task before this gate is resolved.
