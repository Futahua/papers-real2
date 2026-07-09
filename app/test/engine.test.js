'use strict';

// Engine seam tests. These do not require any runtime to be live — the
// contract under test is honesty: Papers-native prompts in, and either real
// output or a legible failure out. Never fabricated text.

const test = require('node:test');
const assert = require('node:assert');

const engine = require('../engine');
const prompts = require('../engine/prompts');

const context = {
  world: { name: 'Test world' },
  room: { title: 'Test room' },
  things: [
    { displayName: 'a.txt', type: 'file', status: 'present', path: 'C:\\real\\a.txt' },
    { displayName: 'lost.txt', type: 'file', status: 'missing', path: 'C:\\real\\lost.txt' },
  ],
  artifacts: [{ title: 'Old note', createdAt: '2026-07-01T00:00:00.000Z' }],
  conversation: [
    { role: 'creator', text: 'hi', at: '' },
    { role: 'status', text: 'engine hiccup', at: '' },
  ],
};

function withEnv(vars, fn) {
  const saved = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  const restore = () => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
  return fn().finally(restore);
}

test('room context is serialized in Papers terms, truthfully', () => {
  const block = prompts.roomContextBlock(context);
  assert.match(block, /room "Test room"/);
  assert.match(block, /world "Test world"/);
  assert.match(block, /a\.txt — file, present/);
  assert.match(block, /lost\.txt — file, missing/); // missing is told, not hidden
  assert.match(block, /"Old note"/);
  assert.match(block, /Creator: hi/);
  assert.ok(!block.includes('engine hiccup'), 'status entries are not conversation');
});

test('note responses parse the TITLE line, and fall back honestly', () => {
  const parsed = prompts.parseNoteResponse('TITLE: A good note\n\nThe body.');
  assert.equal(parsed.title, 'A good note');
  assert.equal(parsed.body, 'The body.');
  const loose = prompts.parseNoteResponse('No title line at all.');
  assert.equal(loose.title, null);
  assert.equal(loose.body, 'No title line at all.');
});

test('an unknown configured runtime fails honestly and names the known ones', async () => {
  await withEnv({ PAPERS_ENGINE: 'imaginary-runtime' }, async () => {
    const result = await engine.roomReply(context, 'hello?');
    assert.equal(result.ok, false);
    assert.match(result.error, /imaginary-runtime/);
    assert.match(result.error, /claude-cli/);
    assert.match(result.error, /ollama/);
    assert.equal(result.text, undefined);
  });
});

test('an unreachable local runtime fails honestly, not silently', async () => {
  await withEnv(
    {
      PAPERS_ENGINE: 'ollama',
      PAPERS_ENGINE_URL: 'http://127.0.0.1:1', // nothing listens here
      PAPERS_ENGINE_MODEL: 'any-model',
    },
    async () => {
      const result = await engine.roomReply(context, 'hello?');
      assert.equal(result.ok, false);
      assert.match(result.error, /could not be reached/);
      assert.match(result.error, /127\.0\.0\.1:1/);
      assert.equal(result.text, undefined);
    }
  );
});

test('the active runtime either answers or fails honestly — never silently', async () => {
  const result = await engine.roomReply(context, 'What is in this room?');
  if (result.ok) {
    assert.ok(result.text.length > 0);
    assert.ok(result.engineLabel, 'success carries honest provenance of what generated it');
  } else {
    assert.ok(result.error.length > 0);
    assert.equal(result.text, undefined);
  }
});

test('note generation propagates runtime failure instead of inventing a note', async () => {
  const readings = [
    { thing: context.things[0], content: { kind: 'text', text: 'real file content' } },
  ];
  const result = await engine.generateRoomNote(context, readings);
  if (result.ok) {
    assert.ok(result.body.length > 0);
    assert.ok(result.engineLabel);
  } else {
    assert.ok(result.error.length > 0);
    assert.equal(result.body, undefined);
  }
});
