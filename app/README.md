# Papers — app (Slice 1)

This is the REAL2 implementation of **Slice 1 — one world, one room, real things** from
[`DOCS/PAPERS_NEXT_BUILD_ORDER_V1.txt`](../DOCS/PAPERS_NEXT_BUILD_ORDER_V1.txt).

Papers opens into a persistent world — the Papers-owned layer over this real machine.
**Backpacks** are the Papers-native places within it (see
[`DOCS/PAPERS_ONTOLOGY_CLARIFICATION_V1.txt`](../DOCS/PAPERS_ONTOLOGY_CLARIFICATION_V1.txt));
what the code calls a "room" is the first implemented Backpack surface, and `room`
survives in identifiers, IPC channels, and schema labels as an implementation label
only. A Backpack holds truthful references to real files and folders, a Backpack-scoped
conversation, durable Backpack notes the AI writes from those things, and a
Papers-owned Backpack history. Entering a Backpack lands on its own state: a
creator-written description, an honest snapshot, a callout for things it has lost
contact with, what happened since your last visit, and the notes pinned to it.
Each Backpack has a **Desk** — its active work surface (see
[`DOCS/PAPERS_BACKPACK_DESK_V1.txt`](../DOCS/PAPERS_BACKPACK_DESK_V1.txt)): a brief in
the creator's words, things and notes placed on the Desk, and one working note the AI
revises in place from that Desk with a full provenance trail. The AI treats the Desk
as its default working context.
Backpack history is a navigable timeline — grouped by day, marked at your last visit,
honest about reality drift (lost/recovered contact with real things), and each event
is a path back into the note or real location it is about. Everything survives closing
and reopening the app.

## Run

```
cd app
npm install
npm start
```

- **World location:** `%APPDATA%\Papers\world` (override with the `PAPERS_WORLD_DIR`
  environment variable). The world store is plain, human-legible JSON — it is Papers'
  system of record, deliberately inspectable.
- **Tests:** `npm test` (world continuity, truthfulness, engine-seam honesty).
- **Smoke check:** `npm run smoke` (boots the app headless and reports the world).

## The AI

The AI inside rooms speaks through one Papers-native engine seam
([`engine/index.js`](engine/index.js)): reply in room context, write a room note from
selected room things. Underneath, interchangeable runtime backends implement a tiny
text-in/text-out contract. Papers stores **no** runtime credentials, sessions, or
provider state; the Papers world store is the only custodian of continuity, and every
AI-made note records which runtime actually wrote it.

Runtime selection is a dev-level environment variable, not a product surface:

| `PAPERS_ENGINE` | Backend | Needs |
|---|---|---|
| `claude-cli` (default) | locally installed Claude Code CLI, print mode | one-time `claude` → `/login` |
| `ollama` | local Ollama server | Ollama running; optional `PAPERS_ENGINE_URL` (default `http://127.0.0.1:11434`) and `PAPERS_ENGINE_MODEL` (default: first installed model) |

If the selected runtime is unavailable, rooms keep working fully — attach things, open
real locations, everything persists — and the AI reports honestly that it cannot
respond rather than faking replies.

**Acceptance walk:** `node scripts/verify-slice1.js` runs the Slice 1 flow headless
(world → room → real things → AI reply → guarded note → restart → missing-reference
truthfulness) against whichever runtime is selected, and reports the AI path honestly
as LIVE or as an honest failure.

## Layout

```
app/
├── main.js            Electron main — loads the world, registers the IPC surface
├── preload.js         The renderer's Papers API (world / room / thing / note terms)
├── world/             The Papers-owned world store (system of record)
│   ├── store.js       World, rooms, things, artifacts, conversations on disk
│   ├── things.js      Truthful references to real machine items
│   └── ids.js
├── engine/
│   ├── index.js       The one engine seam: Papers-native actions, runtime selection
│   ├── prompts.js     Papers → text serialization (runtime-neutral)
│   └── runtimes/      Backend per runtime; vendor vocabulary stops here
│       ├── claude-cli.js
│       └── ollama.js
├── scripts/
│   └── verify-slice1.js  Headless Slice 1 acceptance walk
├── ui/                World-first shell: world view → room surface
└── test/              Continuity + truthfulness tests (node --test)
```
