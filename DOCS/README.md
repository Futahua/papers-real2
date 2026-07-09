# Papers Documentation Index (REAL2)

This directory contains the governing documentation for the Papers rebuild. It exists to keep the REAL2 line coherent across session resets, agent swaps, implementation churn, and future contributors. If you are touching REAL2, this directory is the first place you should read.

REAL2 begins as a documentation-first rebuild. These documents are not filler around the implementation; they are the mechanism that keeps the implementation from drifting back into legacy v0’s failure mode.

## What this documentation is for

The REAL2 docs serve five jobs:

1. Define what Papers actually is so the rebuild does not quietly turn into a generic agent workbench.
2. Record the judgment on legacy v0 so future work can salvage the right pieces without inheriting the wrong product shape.
3. Tell coding agents how to behave when the founder cannot answer implementation questions directly.
4. Preserve continuity across chat/session resets so the product direction survives beyond a single conversation.
5. Control build order so implementation follows the Papers worldview rather than whatever plumbing is easiest to code first.

If a future session can read this folder and pick up the rebuild without having to rediscover what Papers is, the docs are doing their job.

## Reading order

If you are new to REAL2, read in this order.

### 1) `PROMPTER/PAPERS_FOUNDER_BRIEF.txt`

Read first. This is the highest-authority statement of what Papers fundamentally is.

It defines:

* the non-negotiable identity of Papers
* the original founder concepts (Backpacks, Tools, global AI, truthful grounding)
* what the project must not collapse into
* the tests new proposals must survive

If you read only one document before making a judgment about Papers, read this one.

### 2) `PAPERS_REPO_DECISION_AUDIT_V1.txt`

Read second. This is the full classification of legacy Papers v0 (`REAL` / `Futahua/papers-are-papers`) against founder intent, plus the rebuild recommendation for REAL2.

It explains:

* what v0 actually is
* what parts of it are core, contingent, mistaken, or contaminated
* what should be salvaged, referenced, or left behind
* why REAL2 must be a separate rebuild rather than “v0 cleaned up”

This document is the bridge between the founder vision and the actual code history.

### 3) `PROMPTER/PAPERS_AGENT_CONSTITUTION_V1.txt`

Read third. This is the operating constitution for coding agents working on REAL2.

It exists because the founder is not a developer and should not be forced to answer low-level architectural questions they were never equipped to answer. The constitution tells agents:

* what they are allowed to infer on the founder’s behalf
* what they must not ask the founder to decide
* how to interpret ambiguity in favor of Papers rather than generic software habits
* how to handle salvage from REAL
* how to keep the engine, provider, and workbench layers in their proper place

If you are implementing REAL2, this document is binding.

### 4) `PROMPTER/PAPERS_PROMPTER_HANDOFF.txt`

Read fourth. This explains how a fresh session should be brought up to speed, what the active docs are, and what work is expected next.

It is the handoff primer for new sessions.

### 5) `PROMPTER/PAPERS_PROXY_OPERATING_MANUAL.txt`

Read fifth. This governs how the “proxy prompter” should behave across sessions — meaning the assistant role that is effectively taking over the founder’s prompting/orchestration job.

It defines:

* how to act as the founder’s proxy rather than as a passive yes-man
* how to preserve the founder’s ambitions while making informed technical judgments
* how to avoid cargo-culting buzzwords or flattening the project into generic architecture
* how to keep the long-term shape intact while still making practical implementation decisions

### 6) `PROMPTER/PAPERS_SESSION_CLOSEOUT_PROTOCOL.txt`

Read when ending a session or preparing to switch chats. This is the continuity-preservation protocol.

It exists to make sure that when a conversation ends, the important decisions do not die with it. It should be used to produce closeout notes and doc updates before context is lost.

### 7) `PAPERS_NEXT_BUILD_ORDER_V1.txt`

Present. This is the operational sequencing document for the rebuild.

It answers:

* what the first real REAL2 slice is (**Slice 1 — one world, one room, real things**)
* what order implementation should happen in
* what is intentionally deferred at each stage
* what must be proven before moving to the next slice
* what may be salvaged from legacy v0, and when

This document should be read before any implementation work begins.

## Authority and precedence inside `DOCS/`

Not all docs have equal weight.

**Highest authority**

1. `PROMPTER/PAPERS_FOUNDER_BRIEF.txt` — the source of truth for what Papers fundamentally is.

**High authority**

2. Explicit correction/supersession docs that clearly say they override the founder brief on a specific point.
   * `PAPERS_ONTOLOGY_CLARIFICATION_V1.txt` — canonical WORLD / BACKPACK / ROOM vocabulary (a clarification consistent with the founder brief; binding on implementation vocabulary, docs, and milestone framing).

**Operational rebuild authority**

3. `PAPERS_REPO_DECISION_AUDIT_V1.txt`
4. `PROMPTER/PAPERS_AGENT_CONSTITUTION_V1.txt`
5. `PAPERS_NEXT_BUILD_ORDER_V1.txt`

These documents do not redefine Papers from scratch; they operationalize the founder brief and turn it into a rebuild program.

**Session continuity / operating behavior**

6. `PROMPTER/PAPERS_PROMPTER_HANDOFF.txt`
7. `PROMPTER/PAPERS_PROXY_OPERATING_MANUAL.txt`
8. `PROMPTER/PAPERS_SESSION_CLOSEOUT_PROTOCOL.txt`

These are behavioral and continuity docs. They matter a lot, but they do not outrank the founder brief or explicit rebuild decisions.

## Current document set

**Present now**

* `PAPERS_REPO_DECISION_AUDIT_V1.txt`
* `PAPERS_NEXT_BUILD_ORDER_V1.txt`
* `PAPERS_ONTOLOGY_CLARIFICATION_V1.txt` — canonical WORLD / BACKPACK / ROOM vocabulary correction
* `PAPERS_BACKPACK_DESK_V1.txt` — the Desk: the Backpack's active work surface (first-form concept)
* `PAPERS_DELTA_LOG.txt` — lightweight cumulative record of material changes (newest first)
* `PROMPTER/PAPERS_FOUNDER_BRIEF.txt`
* `PROMPTER/PAPERS_PROMPTER_HANDOFF.txt`
* `PROMPTER/PAPERS_PROXY_OPERATING_MANUAL.txt`
* `PROMPTER/PAPERS_SESSION_CLOSEOUT_PROTOCOL.txt`
* `PROMPTER/PAPERS_AGENT_CONSTITUTION_V1.txt`

**Still expected**

* None. The governing document set is complete.

The full governing set now exists. REAL2 remains documentation-only until the creator authorizes implementation; once authorized, work follows `PAPERS_NEXT_BUILD_ORDER_V1.txt` starting from Slice 1.

## How these docs should be used during the rebuild

### If you are starting a fresh session

Read, at minimum:

1. `PROMPTER/PAPERS_FOUNDER_BRIEF.txt`
2. `PAPERS_REPO_DECISION_AUDIT_V1.txt`
3. `PROMPTER/PAPERS_AGENT_CONSTITUTION_V1.txt`
4. `PROMPTER/PAPERS_PROMPTER_HANDOFF.txt`

That should be enough to understand what Papers is, why REAL2 exists, what legacy v0 got wrong, and how to proceed without forcing the founder to make technical calls they cannot reasonably make.

### If you are about to implement code

Read, at minimum:

1. `PROMPTER/PAPERS_FOUNDER_BRIEF.txt`
2. `PAPERS_REPO_DECISION_AUDIT_V1.txt`
3. `PROMPTER/PAPERS_AGENT_CONSTITUTION_V1.txt`
4. `PAPERS_NEXT_BUILD_ORDER_V1.txt`

Do not start implementation from the legacy repo shape, and do not infer the product from generic agent-app conventions.

### If you are closing a session

Use `PROMPTER/PAPERS_SESSION_CLOSEOUT_PROTOCOL.txt` and update the relevant docs if a decision was made that future sessions must inherit.

The docs are only useful if they stay current enough to carry the rebuild forward.

## Relationship to the legacy repo

This `DOCS/` folder belongs to REAL2, the canonical rebuild repo (`Futahua/papers-real2`). It does not govern the legacy repo (`Futahua/papers-are-papers`) retroactively.

The legacy repo remains useful as:

* a historical record of how Papers v0 actually evolved
* a parts shelf for narrow salvage
* evidence for contamination patterns to avoid repeating

But the legacy repo is not an authority source for what Papers should become. If legacy implementation and REAL2 docs disagree, the REAL2 docs win.

## Directory layout

```text
DOCS/
├── README.md
├── PAPERS_REPO_DECISION_AUDIT_V1.txt
├── PAPERS_NEXT_BUILD_ORDER_V1.txt
└── PROMPTER/
    ├── PAPERS_FOUNDER_BRIEF.txt
    ├── PAPERS_PROMPTER_HANDOFF.txt
    ├── PAPERS_PROXY_OPERATING_MANUAL.txt
    ├── PAPERS_SESSION_CLOSEOUT_PROTOCOL.txt
    └── PAPERS_AGENT_CONSTITUTION_V1.txt
```

Any future governing doc (e.g. a build-order V2, or a correction memo) should live in this directory as well and be added to this index immediately.

## Practical rule

If you are ever unsure what to do next, do not default to “build the easiest generic app scaffold.” Start by asking:

1. What would the founder brief consider the real Papers move here?
2. What did the repo decision audit explicitly tell us to leave behind from v0?
3. Does the agent constitution allow me to make this call on the founder’s behalf?
4. Has the build-order document actually authorized this slice yet?

If those four answers are not clear, the correct next action is to resolve the ambiguity in the docs first rather than silently coding the wrong product.
