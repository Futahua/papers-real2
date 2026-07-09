'use strict';

// Engine seam tests. These do not require the engine to be signed in — the
// live path on a fresh machine is the honest-failure path, and that path is
// exactly what must never fake output.

const test = require('node:test');
const assert = require('node:assert');

const engine = require('../engine/adapter');

const context = {
  world: { name: 'Test world' },
  room: { title: 'Test room' },
  things: [
    {
      displayName: 'a.txt',
      type: 'file',
      status: 'present',
      path: 'C:\\real\\a.txt',
    },
    {
      displayName: 'lost.txt',
      type: 'file',
      status: 'missing',
      path: 'C:\\real\\lost.txt',
    },
  ],
  artifacts: [{ title: 'Old note', createdAt: '2026-07-01T00:00:00.000Z' }],
  conversation: [
    { role: 'creator', text: 'hi', at: '' },
    { role: 'status', text: 'engine hiccup', at: '' },
  ],
};

test('room reply either answers or fails honestly — never silently', async () => {
  const result = await engine.roomReply(context, 'What is in this room?');
  if (result.ok) {
    assert.ok(result.text.length > 0);
  } else {
    // Honest failure: a human-legible sentence, no fabricated reply text.
    assert.ok(result.error.length > 0);
    assert.equal(result.text, undefined);
  }
});

test('note generation propagates engine failure instead of inventing a note', async () => {
  const readings = [
    {
      thing: context.things[0],
      content: { kind: 'text', text: 'real file content' },
    },
  ];
  const result = await engine.generateRoomNote(context, readings);
  if (result.ok) {
    assert.ok(result.body.length > 0);
  } else {
    assert.ok(result.error.length > 0);
    assert.equal(result.body, undefined);
  }
});
