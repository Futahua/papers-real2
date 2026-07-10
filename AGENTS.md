# AGENTS.md — Coding-agent entry point

## Authority order (highest first)

1. **Creator’s current explicit direction** — any instruction given in the current session or task prompt. This outranks every document in this repository, including older AI-written planning docs.
2. `DOCS/PAPERS_RECOVERY_MAP_V1.txt` — current product state map, drift audit, implementation classification, and restart gate. Read before any product expansion.
3. `DOCS/PROMPTER/PAPERS_FOUNDER_BRIEF.txt` — foundational product identity (see recovery correction header within it).
4. Later explicit creator corrections that supersede or clarify the founder brief on a specific point.
5. Operational rebuild documents (`DOCS/PAPERS_REPO_DECISION_AUDIT_V1.txt`, `DOCS/PROMPTER/PAPERS_AGENT_CONSTITUTION_V1.txt`, `DOCS/PAPERS_NEXT_BUILD_ORDER_V1.txt`).
6. Legacy repo history — weak evidence, often contaminated.

## Rules for narrow coding tasks

- **Your task prompt defines your scope.** Read it carefully; it is your primary specification.
- **Read only the files named in your task prompt.** Do not explore the repository unless exploration is explicitly part of your assignment.
- **Open additional files only when a direct dependency requires it.** Report each extra file you open and why.
- **Do not perform repository-wide exploration** on narrow tasks — this repo has a long history and many governing documents; most are not relevant to any given task.
- **Do not redesign architecture** during a narrow task.
- **Do not introduce unrelated cleanup** (formatting, naming, refactoring) outside your assigned scope.
- **Do not convert an experiment or local fix into a universal rule** that changes product-wide behavior.
- **Do not create new governing or doctrine documents** unless the task prompt explicitly asks for one.
- **Behavior before builds.** Before any new implementation, the required discipline is: desired creator behavior → existing products and reuse candidates → identify the smallest missing Papers responsibility → only then write a bounded build prompt. Reuse-first is hard law.
- **Do not describe your own interpretation as “the creator’s direction”** unless the creator explicitly said it in their current session or task prompt.
- **Preserve existing behavior** outside the scope of your assignment.
- **Stop and report** if the task would require a significantly larger change than described. Do not expand silently.

## What to do on each task

1. Read `AGENTS.md` (this file).
2. Read the task prompt.
3. Read only the files named in the task prompt.
4. Make only the changes asked for.
5. Open additional files only if a direct dependency requires it — report each one.
6. Submit the completion report below.

## Completion-report format

```
RESULT
FILES CHANGED
EXTRA FILES READ
VERIFICATION
PRODUCT DECISIONS
UNRESOLVED
COMMIT / PR
```

Fill each section briefly. If a section is empty, write “none”.
