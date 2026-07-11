# Papers Backpack v0 — Live Acceptance Record

- Tested commit: `dd273a0fee8b0da4c275e36887821cf8c29d27f3` on `agent/papers-owned-patch-v0-20260711`
- Acceptance date: 2026-07-12 (Asia/Bangkok), run concluded ~01:46
- Verdict: **BLOCKED**
- Launch command: `npm start` from `_agent_papers_owned_patch_v0_20260711\app` (source-run Electron)

## What the creator did

Launched the source-run Papers UI, completed isolated device-auth sign-in
into the Papers-owned `CODEX_HOME` using the fixed clipboard command,
selected the clean disposable linked worktree
`_papers_backpack_v0_acceptance_worktree_20260712` through the native
validated picker, entered the bounded acceptance instruction, and started
the task. After the first completed turn returned no proposal, the creator
authorized one corrected tool-action turn and made two further retries.
The creator preserved the sanitized session history through the trusted
`getSanitizedHistory()` / `listPatchProposals()` / `listPatchReceipts()`
APIs from the renderer console.

## What Codex did

Sign-in, thread start, and turn execution all worked: 2 App Servers were
started across the run (the first was lost to an external app
termination), model `gpt-5.4-mini`, 5 model turns initiated in total. In
every observed turn the model produced the correct patch **as plain
agent-message text** (`*** Begin Patch … *** End Patch`) instead of
invoking its structured file-change capability. It never emitted an
`item/fileChange` or an `item/fileChange/requestApproval`, made no
command-execution attempt, and mutated nothing.

## What Papers did

Papers behaved correctly at every step it was given: executable
resolution, isolated home, native worktree validation, task launch, and
event journaling. Because no structured fileChange approval request ever
arrived, Papers captured zero proposals, sent no denial, applied nothing,
and displayed no receipt. Papers deliberately does **not** parse patch
text out of chat messages — that would bypass the
decline-before-apply authority boundary — so the acceptance is blocked on
the provider side, not weakened on the Papers side.

## Provider denial ordering

Not exercised: there was no approval request to decline. No mutation of
any kind occurred before (or after) the never-sent denial.

## Independent Git verification

After the run: `backpack-acceptance.txt` still contains exactly
`BACKPACK_V0_BEFORE`; `git status --porcelain --untracked-files=all` is
empty; fixture HEAD remains `7a503626`; the protected `REAL2` repository
still shows branch `backpack-note-revision` at `16fbb3ba` with the sole
intentional unstaged `app/main.js` (patch ID `e7d6e1c2…`); recovery and
relay branches are unchanged.

## Receipt result

No receipt (correct: nothing was applied). The truthful-receipt UI shipped
in the tested commit and is proven by 7 focused automated tests; a
truthful applied-state cannot be rendered without an
`applied-by-papers` receipt.

## Shutdown and cleanup

Papers closed normally; the App Server exited on stdin close with no
attributable orphan (the only surviving `codex.exe` belongs to the
user's separate OpenAI Codex desktop application). No `papers-patch-*`
temporary directories remain. No credentials appear in evidence.

## Restart readiness

Not evaluated — acceptance blocked before apply; the repeat-ready
worktree was not created.

## Remaining limitations

- `gpt-5.4-mini` under codex-cli 0.125.0 app-server did not emit
  structured fileChange events for this bounded instruction in any of 4
  completed turns (including an explicit tool-action instruction).
  Unblocking requires a provider/model configuration that emits
  structured fileChange approval requests, or a revised elicitation
  strategy validated in a future authorized turn budget.
- Receipt history is in-memory only; provider approval acceptance remains
  disabled; restart readiness unproven in this run.

Backpack v0 is **not accepted** in this run. It is not production-ready.
Automated validation at the tested commit: 166 tests, 0 failures.
Evidence: `evidence/backpack-v0-acceptance-20260712/`.
