# Papers — Canonical Rebuild (REAL2)

This repository is the **canonical Papers rebuild** and the **only active Papers product line** from this point onward. It is a clean, world-first rebuild — **not** a cleaned-up copy of the legacy implementation.

If you are an agent or a person picking this up, read [`DOCS/PROMPTER/`](DOCS/PROMPTER/) and [`DOCS/PAPERS_REPO_DECISION_AUDIT_V1.txt`](DOCS/PAPERS_REPO_DECISION_AUDIT_V1.txt) **before touching anything**. Authority comes from those documents, **not** from the legacy source structure.

---

## The two repositories

Papers has two separate local directories and two separate GitHub repositories. Treat them very differently.

|                         | Directory                 | GitHub repo                 | Role                                                            |
| ----------------------- | ------------------------- | --------------------------- | --------------------------------------------------------------- |
| **Legacy (v0)**         | `Papers are papers\REAL`  | `Futahua/papers-are-papers` | Archived parts shelf and historical record. **Reference only.** |
| **Canonical (rebuild)** | `Papers are papers\REAL2` | `Futahua/papers-real2`      | Active product line. **All new work happens here.**             |

* **REAL = legacy Papers v0.** A well-engineered but wrongly-shaped implementation: a safety-hardened cockpit for one specific agent runtime (Hermes), wrapped around a generic agent chat workbench, with Papers vocabulary painted onto a disabled menu. It is retained as a salvage source and a lesson. It is **not** the base for ongoing work.
* **REAL2 = the canonical rebuild.** Its authority is the rebuild documentation in `DOCS/`, governed above all by `DOCS/PROMPTER/PAPERS_FOUNDER_BRIEF.txt`. Its center of gravity is the **Papers world model**, not an agent engine.

### Why the repositories are split

The split is deliberate and structural. Its purpose is to stop future work from drifting back into “a generic agent workbench with Papers vocabulary painted on top” — which is exactly what legacy v0 became. Keeping the rebuild in a separate repo means REAL2 cannot silently inherit v0’s assumptions, session model, provider-centric surfaces, or Hermes-as-identity coupling.

---

## Hard rules for this repository

1. **Do not continue development inside the legacy repo** (`Futahua/papers-are-papers` / REAL).
2. **Do not merge REAL2 into the legacy repo**, and do not merge legacy into REAL2.
3. **No wholesale migration from REAL.** Do not copy the legacy codebase into REAL2, and do not scaffold REAL2 by refactoring the old repo in place.
4. **Salvage is deliberate, narrow, and documented.** REAL may be mined for specific proven pieces (see the audit’s salvage map) — but only by explicit decision, slice by slice, never as a bulk import.
5. **Authority is the rebuild docs, not legacy source.** When code, legacy implementation, or old plans disagree with the governing docs, the governing docs win.
6. **Future sessions and implementation work target REAL2 only.**
7. **The first implementation scaffold in REAL2 must be designed from the REAL2 docs themselves, not copied from the legacy app shell and renamed.**
8. **REAL2 must not collapse into an engine cockpit, provider console, or generic chat workbench with Papers language layered on top.** If a proposed change moves the product in that direction, it is the wrong change.

---

## What Papers is (non-negotiable)

Papers is an **AI-native personal layer over the existing computer**. Windows remains the operating system; Papers sits above it as one coherent, accumulative, inhabitable personal environment. Its distinctive concepts — all original founder DNA — are:

* **Backpacks**: persistent, overlapping rooms/lenses over the same real world, never sealed silos
* **Tools**: reusable capabilities shared across that world
* **A global AI**: present across the whole environment rather than trapped in one room
* **Truthful grounding**: Papers points back to the creator’s real files, systems, and sources; it never pretends imported copies are the originals

The practical agent/operator workbench is a **foundation**, not the product’s identity. Papers must never collapse into an engine cockpit, provider console, or generic chat workbench with Papers language layered on top.

Full statement: `DOCS/PROMPTER/PAPERS_FOUNDER_BRIEF.txt`.

---

## Authority chain (highest wins)

1. **`DOCS/PROMPTER/PAPERS_FOUNDER_BRIEF.txt`** — what Papers fundamentally is.
2. Later explicit correction documents that say they supersede the founder brief on a point.
3. Operational rebuild documents — `DOCS/PAPERS_REPO_DECISION_AUDIT_V1.txt`, `DOCS/PROMPTER/PAPERS_AGENT_CONSTITUTION_V1.txt`, and `DOCS/PAPERS_NEXT_BUILD_ORDER_V1.txt`.
4. The creator’s live direction in-session.
5. Legacy repo history, old plans, and legacy implementation details — **weak evidence, often contaminated**.

Supporting behavioral docs:

* `DOCS/PROMPTER/PAPERS_PROMPTER_HANDOFF.txt`
* `DOCS/PROMPTER/PAPERS_PROXY_OPERATING_MANUAL.txt`
* `DOCS/PROMPTER/PAPERS_SESSION_CLOSEOUT_PROTOCOL.txt`

These do not outrank the founder brief. They exist to keep future sessions, agents, and handoffs aligned with it.

---

## Implementation gate

**No implementation work should begin in REAL2 until the governing rebuild document set exists and is accepted as the active authority.**

That minimum set is:

1. `DOCS/PROMPTER/PAPERS_FOUNDER_BRIEF.txt` — present
2. `DOCS/PAPERS_REPO_DECISION_AUDIT_V1.txt` — present
3. `DOCS/PROMPTER/PAPERS_AGENT_CONSTITUTION_V1.txt` — present
4. `DOCS/PAPERS_NEXT_BUILD_ORDER_V1.txt` — present

The full set now exists. Implementation may begin **once the creator accepts these
documents as the active authority**, and it must follow
`DOCS/PAPERS_NEXT_BUILD_ORDER_V1.txt` — starting from **Slice 1 (one world, one
room, real things)**, world-first, never from the legacy app shell.

---

## Repository layout

```text
REAL2/
├── README.md
├── .gitignore
└── DOCS/
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

### What belongs here

* Governing founder / proxy / rebuild documentation
* The eventual REAL2 implementation, following `DOCS/PAPERS_NEXT_BUILD_ORDER_V1.txt` once implementation is authorized
* Narrow, explicitly justified salvage from REAL, only when a specific REAL2 slice calls for it

### What does **not** belong here

* A copied or renamed legacy app shell
* Bulk imports from REAL
* A generic Tauri/React chat workbench scaffold created “just to get started”
* Provider-setup work, engine-management surfaces, or session plumbing treated as the product’s center of gravity

---

## Current REAL2 status

REAL2 is in **implementation — Slice 2A (room work becomes a real room surface)**, following `DOCS/PAPERS_NEXT_BUILD_ORDER_V1.txt`, world-first. **Slice 1 is implemented and merged** (PR #1), with its full flow verified live end-to-end.

Present in the repository now:

* **Founder brief** — present
* **Repo decision audit** — present
* **Agent constitution** — present
* **Build order (`PAPERS_NEXT_BUILD_ORDER_V1`)** — present
* **Prompter / proxy / closeout docs** — present
* **Delta log (`PAPERS_DELTA_LOG`)** — present, the running record of implementation state
* **Application code** — present in [`app/`](app/)

Current app state (see `app/README.md` and `DOCS/PAPERS_DELTA_LOG.txt` for the full record): persistent world store; Backpack rooms with truthful file/folder references, durable AI-written room notes with provenance, room-scoped conversation, and a Papers-owned room history; a room landing that greets the creator with the room's own state (description, honest snapshot, missing-reality callout, since-your-last-visit, pinned work). The AI speaks through one Papers-native engine seam with interchangeable runtime backends (Claude Code CLI by default; a local Ollama server as a verified-live alternative). The engine is never the custodian of continuity, and unavailability is reported honestly, never faked.

---

## Legacy repo status

The legacy repo `Futahua/papers-are-papers` remains the archived Papers v0 line. It is retained for:

* historical record
* targeted salvage of proven pieces
* negative reference for contamination patterns to avoid in REAL2

It is **not** the active product line, and it is **not** the implementation base for the rebuild.
