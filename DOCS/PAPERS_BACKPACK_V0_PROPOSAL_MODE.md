# Papers Backpack v0 — Proposal-Only Provider Mode

Backpack v0 experimental vertical slice. Not production-ready.

## Why this mode exists

Codex CLI 0.125.0's App Server with `gpt-5.4-mini` never emitted structured
`fileChange` approval requests in live acceptance; it returned correct patch
content as plain final-answer text. Papers must not reinterpret arbitrary
chat patch text as a provider action, so a distinct contract exists:
**provider-message proposal**. It is untrusted proposal data only — not a
provider approval, not a provider mutation, not a provider file-change
action, not proof Codex changed a file, and never permission to apply
automatically. Only Papers may apply it, after independent validation and
explicit creator review.

## Contract

Every creator task runs in main-process-owned `proposalOnly` mode. Papers
generates a 128-bit random nonce per turn, stores it with the thread, turn,
workspace, mode, creator instruction, and creation time, and prepends a
fixed contract requiring the model's complete final response to be exactly
one JSON object:

```json
{ "schema": "papers.patch-proposal.v1", "nonce": "<PAPERS_NONCE>",
  "summary": "<brief description>", "diff": "<complete unified Git diff>" }
```

The renderer supplies only `workspace` (from the trusted native picker),
`instruction`, and `requireOffline` — never schema, nonce, diff, patch
text, affected paths, provider identifiers, model, contract, executable, or
RPC methods.

## Strict capture

`ProviderMessageProposalParser` accepts only a bare JSON object or exactly
one ```json fence, and fails closed on prose, multiple objects or fences,
apply_patch envelopes, Markdown, malformed or duplicate-key JSON, unknown or
missing fields, wrong schema, wrong nonce, empty/oversized/NUL diffs. The
diff then passes the existing `PatchProposalValidator` (which also requires
git-format `diff --git` headers and a final trailing newline — git treats an
unterminated patch as corrupt). Candidates are captured only from the
main-process App Server event stream (`item/completed`, `agentMessage`,
`final_answer`), correlated to the active thread, turn, nonce, and trusted
workspace, deduplicated by item id, at most one per turn, and become
actionable only after a correlated `turn/completed` with status `completed`.

## Authority model

Structured `fileChange` approvals keep the existing decline-before-apply
path unchanged and take precedence. A command-execution approval suppresses
any message proposal from that turn. A turn producing both forms is a
protocol conflict and applies nothing. Message-proposal application never
calls the approval coordinator: there is no provider denial because no
provider-side action exists. Receipts record
`proposalSource: provider-message-json`, `providerActionRequested: false`,
`providerDecision: not-applicable`, `providerTerminalStatus: completed`,
`turnTerminalConfirmed: true`, and never claim a provider decline. The UI
says "Applied safely by Papers from a reviewed provider proposal" — never
"after provider denial" — for this source.

## 2026-07-12 live acceptance verdict

**BLOCKED** at `01ffc494` (see
`evidence/backpack-v0-proposal-mode-acceptance-20260712/`). The contract
itself worked — both turns returned exactly one valid nonce-bound JSON
object with the correct single-file intent — but the provider's diff
serialization failed twice: turn 1 omitted the `diff --git` header
(rejected at capture); turn 2 omitted the final trailing newline, which git
rejects as a corrupt patch, so the Papers-owned apply failed closed with
zero mutation after the creator had reviewed the proposal card. The creator
authorized no further turns. The contract now demands both details
explicitly and the validator rejects unterminated diffs at capture, but
that correction is unproven live. The fixture worktree and the protected
repository are unchanged; 207 automated tests pass.

## Terminal-LF transport canonicalization

JSON string transport routinely drops the final line terminator git
requires. In provider-message mode only, and only after every strict parse
check passes (schema, exact nonce, field allowlist, size, NUL), the parser
preserves the raw provider diff bytes for hashing, normalizes CRLF to LF,
and appends exactly one `\n` when the nonempty diff lacks it — no other
repair. It never adds a `diff --git` header, `---`/`+++`/hunk headers,
alters paths or lines, or infers a patch from partial output; the resulting
canonical diff then passes the complete, unmodified `validateUnifiedDiff()`.
That validator stays strict for every other caller and still rejects
unterminated patches passed directly to it; the exception is scoped to the
authenticated, nonce-bound, correlated provider-message transport. Proposals
and receipts record `terminalLfAppended`, `rawProviderDiffSHA256` (the exact
provider bytes) and `patchSHA256` (the canonical applied bytes); the UI and
receipt show "Transport normalization: Added required terminal line ending"
only when Papers actually appended the LF, never implying the provider
emitted git-ready bytes.

## 2026-07-12 FINAL live acceptance verdict — PASS

At `d15aca17` the single authorized proposal-only turn **PASSED**.
`gpt-5.4-mini` returned exactly one nonce-bound `papers.patch-proposal.v1`
JSON object affecting only `backpack-acceptance.txt`; the creator reviewed
the exact `-BACKPACK_V0_BEFORE`/`+BACKPACK_V0_AFTER` diff; Papers validated
and applied it itself; the file became exactly `BACKPACK_V0_AFTER` with a
clean single-file git status; the visible receipt reported
`providerDecision: not-applicable` with verifying hashes
(`resultingDiffSHA256` matched the worktree diff, `patchSHA256` matched the
applied bytes, no nonce present). This run's diff already ended in LF, so
`terminalLfAppended` was false — the canonicalization is present and
unit-proven but was not needed live this time. App Server exited cleanly
with no orphan; restart readiness passed. Evidence:
`evidence/backpack-v0-final-acceptance-20260712/`. 216 automated tests pass.

The original structured fileChange acceptance remains BLOCKED for Codex CLI
0.125.0 with gpt-5.4-mini. Backpack v0 proposal-only mode, using explicit
terminal-LF transport canonicalization, is accepted for private creator use
as a source-run experimental release candidate. It is not production-ready.
