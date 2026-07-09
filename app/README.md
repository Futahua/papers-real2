# Papers — app (Slice 1)

This is the REAL2 implementation of **Slice 1 — one world, one room, real things** from
[`DOCS/PAPERS_NEXT_BUILD_ORDER_V1.txt`](../DOCS/PAPERS_NEXT_BUILD_ORDER_V1.txt).

Papers opens into a persistent world. Rooms hold truthful references to real files and
folders on this machine, a room-scoped conversation, and durable room notes the AI
writes from those things. Everything survives closing and reopening the app.

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

The AI inside rooms is powered through one thin engine seam
([`engine/adapter.js`](engine/adapter.js)) that calls the locally installed Claude Code
CLI in print mode. Papers stores **no** engine credentials, sessions, or provider
state; the Papers world store is the only custodian of continuity.

One-time setup on a new machine: open a terminal, run `claude`, sign in with `/login`.
Until then, rooms work fully — attach things, open real locations, everything persists —
and the AI reports honestly that it is not signed in rather than faking replies.

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
│   └── adapter.js     The one engine seam. Engine vocabulary stops here.
├── ui/                World-first shell: world view → room surface
└── test/              Continuity + truthfulness tests (node --test)
```
