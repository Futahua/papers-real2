# Papers — Canonical Rebuild (REAL2)

This repository is the **canonical Papers rebuild** and the **only active Papers product line** from this point onward. It is a clean, world-first rebuild — **not** a cleaned-up copy of the legacy implementation.

If you are a **coding agent on a narrow task**, read [`AGENTS.md`](AGENTS.md) first, follow your task prompt, and read only the files it names. If you are doing broad orientation, read [`DOCS/PROMPTER/`](DOCS/PROMPTER/) and [`DOCS/PAPERS_REPO_DECISION_AUDIT_V1.txt`](DOCS/PAPERS_REPO_DECISION_AUDIT_V1.txt). In all cases the creator’s live direction in the current session is the highest authority.

---

## The two repositories

Papers has two separate local directories and two separate GitHub repositories. Treat them very differently.

|                         | Directory                 | GitHub repo                 | Role                                                            |
| ----------------------- | ------------------------- | --------------------------- | --------------------------------------------------------------- |
| **Legacy (v0)**         | `Papers are papers\REAL`  | `Futahua/papers-are-papers` | Archived parts shelf and historical record. **Reference only.** |
| **Canonical (rebuild)** | `Papers are papers\REAL2` | `Futahua/papers-real2`      | Active product line. **All new work happens here.**             |

* **REAL = legacy Papers v0.** A well-engineered but wrongly-shaped implementation: a safety-hardened cockpit for one specific agent runtime (Hermes), wrapped around a generic agent chat workbench, with Papers vocabulary painted onto a disabled menu. It is retained as a salvage source and a lesson. It is **not** the base for ongoing work.
* **REAL2 = the canonical rebuild.** Its authority is the rebuild documentation in `DOCS/`, governed above all by `DOCS/PROMPTER/PAPERS_FOUNDER_BRIEF.txt`. Its current product state is mapped in `DOCS/PAPERS_RECOVERY_MAP_V1.txt` — read that document before any product expansion or new build prompt.

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

## What Papers is (binding creator definition)

Papers is a **lightweight personal layer over Windows**. Its universal governing responsibility:

> **Papers persistently identifies, organizes, exposes, enters, tracks, leaves, and switches Backpacks — one active Backpack at a time.**

Backpacks may be literally anything the creator designates. **One active Backpack at a time is the only universal runtime assumption.** No universal assumptions may be made about a Backpack’s interface, contents, furniture (dashboard, Desk, notes, files, chat, history, artifacts), AI integration, lifecycle, or state model — those are each Backpack’s own concern.

Papers itself must not prescribe: one global Papers AI; permanent World-level memory; universal Backpack context; AI in every Backpack; one provider or runtime; or any particular Backpack furniture as mandatory.

**Reuse-first is hard law.** Before any new capability is built, the discipline is: desired creator behavior → existing products → reuse investigation → smallest missing Papers responsibility → implementation.

The current REAL2 application code in `app/` is **experimental proving substrate** — it demonstrates one form a Backpack can take (things, notes, conversation, history, a Desk), not a prescription for what all future Backpacks must contain. See `DOCS/PAPERS_RECOVERY_MAP_V1.txt` for the forensic classification of what the current implementation is, what is reusable, what is quarantined assumption, and what must be resolved before expansion continues.

Papers must never collapse into an engine cockpit, provider console, or generic chat workbench with Papers language layered on top.

Founder statement: `DOCS/PROMPTER/PAPERS_FOUNDER_BRIEF.txt` (see recovery correction header within it).

---

## Authority chain (highest wins)

1. **The creator’s live direction in the current session** — explicit instruction given now always outranks older documents, including AI-written planning docs.
2. **`DOCS/PAPERS_RECOVERY_MAP_V1.txt`** — the current product state map, drift audit, implementation classification, and restart gate. Read before any product expansion or new build prompt.
3. **`DOCS/PROMPTER/PAPERS_FOUNDER_BRIEF.txt`** — what Papers fundamentally is (amended by recovery correction header within it).
4. Later explicit correction documents that say they supersede the founder brief on a specific point.
5. Operational rebuild documents — `DOCS/PAPERS_REPO_DECISION_AUDIT_V1.txt`, `DOCS/PROMPTER/PAPERS_AGENT_CONSTITUTION_V1.txt`, and `DOCS/PAPERS_NEXT_BUILD_ORDER_V1.txt`.
6. Legacy repo history, old plans, and legacy implementation details — **weak evidence, often contaminated**.

Supporting behavioral docs:

* `DOCS/PROMPTER/PAPERS_PROMPTER_HANDOFF.txt`
* `DOCS/PROMPTER/PAPERS_PROXY_OPERATING_MANUAL.txt`
* `DOCS/PROMPTER/PAPERS_SESSION_CLOSEOUT_PROTOCOL.txt`

These do not outrank the founder brief. They exist to keep future sessions, agents, and handoffs aligned with it.

---

## Implementation state

Slice 1 and Slice 2A are implemented in `app/`. The current code is **experimental proving substrate** — it demonstrates one form a Backpack can take, not a prescription for what all future Backpacks must contain.

**Product expansion is paused.** `DOCS/PAPERS_RECOVERY_MAP_V1.txt` documents the stopping point, what was found in the implementation, what is classified as safe reusable substrate versus quarantined assumption, and the conditions (Section I of that document) that must be satisfied before another build prompt is authorized.

No new slices should be started until the restart gate in `DOCS/PAPERS_RECOVERY_MAP_V1.txt` Section I is cleared with the creator.

---

## Repository layout

```text
REAL2/
├── README.md
├── AGENTS.md
├── .gitignore
├── app/                       (the Papers application — see app/README.md)
└── DOCS/
    ├── README.md
    ├── PAPERS_RECOVERY_MAP_V1.txt         (current product state and restart gate)
    ├── PAPERS_REPO_DECISION_AUDIT_V1.txt
    ├── PAPERS_NEXT_BUILD_ORDER_V1.txt
    ├── PAPERS_ONTOLOGY_CLARIFICATION_V1.txt
    ├── PAPERS_BACKPACK_DESK_V1.txt
    ├── PAPERS_DELTA_LOG.txt
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

**Product expansion is paused.** See `DOCS/PAPERS_RECOVERY_MAP_V1.txt` for the current state map, implementation classification, and restart conditions.

Slice 1 and Slice 2A are implemented in `app/`. The code is experimental proving substrate; it demonstrates one form a Backpack can take, not the universal definition of what all Backpacks must be.

Present in the repository now:

* **Founder brief** — present
* **Repo decision audit** — present
* **Agent constitution** — present
* **Build order (`PAPERS_NEXT_BUILD_ORDER_V1`)** — present
* **Prompter / proxy / closeout docs** — present
* **Delta log (`PAPERS_DELTA_LOG`)** — present, the running record of implementation state
* **Application code** — present in [`app/`](app/)

**Vocabulary:** per `DOCS/PAPERS_ONTOLOGY_CLARIFICATION_V1.txt`, the world is the real machine-and-life substrate Papers lives over; **Backpacks** are the core Papers-native places within it; "room" survives only as an internal implementation label for the first Backpack surface.

Current app state (see `app/README.md` and `DOCS/PAPERS_DELTA_LOG.txt` for the full record): persistent world store; **Backpacks** with truthful file/folder references, durable AI-written Backpack notes with provenance, a Backpack-scoped conversation, and a Papers-owned Backpack history rendered as a navigable timeline; a Backpack landing that greets the creator with the Backpack's own state (description, honest snapshot, missing-reality callout, since-your-last-visit, pinned work); and a **Desk** on each existing Backpack surface (`DOCS/PAPERS_BACKPACK_DESK_V1.txt`) — brief, active things/notes, and a working note the Desk-grounded AI revises in place under guard. The AI speaks through one Papers-native engine seam with interchangeable runtime backends (Claude Code CLI by default; a local Ollama server as a verified-live alternative). The engine is never the custodian of continuity, and unavailability is reported honestly, never faked.

---

## Legacy repo status

The legacy repo `Futahua/papers-are-papers` remains the archived Papers v0 line. It is retained for:

* historical record
* targeted salvage of proven pieces
* negative reference for contamination patterns to avoid in REAL2

It is **not** the active product line, and it is **not** the implementation base for the rebuild.
