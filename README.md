# Papers — Canonical Rebuild (REAL2)

This repository is the **canonical Papers rebuild** and the **only active Papers
product line** from this point onward. It is a clean, world-first rebuild — not a
cleaned-up copy of the legacy implementation.

If you are an agent or a person picking this up: read
[`DOCS/PROMPTER/`](DOCS/PROMPTER/) and
[`DOCS/PAPERS_REPO_DECISION_AUDIT_V1.txt`](DOCS/PAPERS_REPO_DECISION_AUDIT_V1.txt)
before touching anything. Authority comes from those documents, **not** from the
legacy source structure.

---

## The two repositories

Papers has two separate local directories and two separate GitHub repositories.
Treat them very differently.

| | Directory | GitHub repo | Role |
|---|---|---|---|
| **Legacy (v0)** | `Papers are papers\REAL` | `Futahua/papers-are-papers` | Archived parts shelf & historical record. **Reference only.** |
| **Canonical (rebuild)** | `Papers are papers\REAL2` | `papers-real2` (this repo) | Active product line. **All new work happens here.** |

- **REAL = legacy Papers v0.** A well-engineered but wrongly-shaped implementation:
  a safety-hardened cockpit for one specific agent runtime (Hermes) with a generic
  agent chat workbench, and Papers vocabulary painted onto a disabled menu. It is
  retained as a salvage source and a lesson. It is **not** the base for ongoing work.
- **REAL2 = the canonical rebuild.** Its authority is the rebuild documentation in
  `DOCS/PROMPTER/`, governed above all by `PAPERS_FOUNDER_BRIEF` (V3). Its center of
  gravity is the **Papers world model**, not an agent engine.

### Why the repositories are split

The split is deliberate and structural. Its whole purpose is to stop future work
from drifting back into "a generic agent workbench with Papers vocabulary painted
on top" — which is exactly what legacy v0 became. Keeping the rebuild in a
separate repo means REAL2 cannot silently inherit v0's assumptions, session model,
provider-centric surfaces, or Hermes-as-identity coupling.

---

## Hard rules for this repository

1. **Do not continue development inside the legacy repo** (`Futahua/papers-are-papers` / REAL).
2. **Do not merge REAL2 into the legacy repo**, and do not merge legacy into REAL2.
3. **No wholesale migration from REAL.** Do not copy the legacy codebase in, and do
   not scaffold REAL2 by refactoring the old repo in place.
4. **Salvage is deliberate, narrow, and documented.** REAL may be mined for specific
   proven pieces (see the audit's salvage map) — but only by explicit decision,
   slice by slice, never as a bulk import.
5. **Authority is the rebuild docs, not legacy source.** When the code and a founder
   doc disagree, the founder doc wins (see the authority chain below).
6. **Future sessions and implementation work target REAL2 only.**

---

## What Papers is (one paragraph, non-negotiable)

Papers is an **AI-native personal layer over the existing computer**. Windows remains
the operating system; Papers sits above it as one coherent, accumulative, inhabitable
personal environment. Its distinctive concepts — all original founder DNA — are
**Backpacks** (persistent, overlapping rooms/lenses over the same real world, never
sealed silos), **Tools** (reusable capabilities shared across that world), a **global
AI** present across the whole environment rather than trapped in one room, and
**truthful grounding** in the creator's real files, systems, and sources (Papers
points back to reality; it never pretends imported copies are the originals). The
practical agent/operator workbench is a *foundation*, not the product's identity.
Full statement: `DOCS/PROMPTER/PAPERS_FOUNDER_BRIEF.txt`.

---

## Authority chain (highest wins)

1. **`DOCS/PROMPTER/PAPERS_FOUNDER_BRIEF.txt`** (V3) — what Papers fundamentally is.
2. Later explicit correction docs that say they supersede the brief on a point.
3. Operational docs — `PAPERS_REPO_DECISION_AUDIT_V1.txt`, and (once written)
   `PAPERS_AGENT_CONSTITUTION`, `PAPERS_NEXT_BUILD_ORDER`.
4. The creator's live direction in-session.
5. Legacy repo history / old plans — **weak evidence, often contaminated.**

Supporting behavioral docs:
`PAPERS_PROMPTER_HANDOFF` (what a fresh session must know first),
`PAPERS_PROXY_OPERATING_MANUAL` (how to behave across sessions),
`PAPERS_SESSION_CLOSEOUT_PROTOCOL` (preserve conclusions before a chat reset).

---

## Repository layout

```
REAL2/
├── README.md                              ← you are here: the repo split & authority chain
├── .gitignore
└── DOCS/
    ├── README.md                          ← docs index & reading order
    ├── PAPERS_REPO_DECISION_AUDIT_V1.txt  ← Core/Contingent/Mistaken audit of legacy v0 + rebuild recommendation
    └── PROMPTER/                          ← governing founder, proxy & agent docs (the authority)
        ├── PAPERS_FOUNDER_BRIEF.txt
        ├── PAPERS_PROMPTER_HANDOFF.txt
        ├── PAPERS_PROXY_OPERATING_MANUAL.txt
        ├── PAPERS_SESSION_CLOSEOUT_PROTOCOL.txt
        └── PAPERS_AGENT_CONSTITUTION_V1.txt
```

No application code is present yet, by design. REAL2 begins as documentation and
scaffolding only. The remaining document to produce (per the prompter handoff) is
`PAPERS_NEXT_BUILD_ORDER`; implementation follows it, world-first.

---

## Status

**Vision / setup stage.** This repo currently contains rebuild documentation and repo
scaffolding only — no migrated v0 implementation. The legacy repo
`Futahua/papers-are-papers` remains untouched as the archived v0 line.
