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
  assert.match(block, /Backpack "Test room"/);
  assert.match(block, /world "Test world"/);
  assert.match(block, /a\.txt — file, present/);
  assert.match(block, /lost\.txt — file, missing/); // missing is told, not hidden
  assert.match(block, /"Old note"/);
  assert.match(block, /Creator: hi/);
  assert.ok(!block.includes('engine hiccup'), 'status entries are not conversation');
});

test('the Desk appears in the assistant\'s Backpack context when in use, serialized truthfully', () => {
  const withDesk = {
    ...context,
    desk: {
      brief: 'Ship the gate plan by Friday.',
      items: [
        { type: 'thing', thing: { displayName: 'plan.txt', type: 'file', status: 'missing', path: 'C:\\real\\plan.txt' } },
        { type: 'note', note: { title: 'Gate measurements' } },
      ],
      workingNote: { title: 'Gate plan — working note' },
    },
  };
  const block = prompts.roomContextBlock(withDesk);
  assert.match(block, /THE DESK/);
  // The Desk is weighted, not enthroned: first attention, Backpack-grounded.
  assert.match(block, /first attention/);
  assert.match(block, /not the Backpack itself/);
  assert.ok(!block.includes('default working context'));
  assert.match(block, /Ship the gate plan by Friday\./);
  assert.match(block, /plan\.txt — file, missing/); // desk does not hide missing reality
  assert.match(block, /the note "Gate measurements"/);
  assert.match(block, /working note: "Gate plan — working note"/);
  // An empty desk adds no desk block at all.
  const empty = prompts.roomContextBlock({ ...context, desk: { brief: '', items: [], workingNote: null } });
  assert.ok(!empty.includes('THE DESK'));
});

test('desk synthesis prompt shares material honestly and evolves the previous note', () => {
  const ctx = {
    ...context,
    desk: { brief: 'Current focus.', items: [], workingNote: { title: 'W' } },
  };
  const prompt = prompts.deskSynthesisPrompt(ctx, {
    readings: [{ thing: { displayName: 'a.txt', type: 'file', path: 'C:\\real\\a.txt' }, content: { text: 'CONTENT-A' } }],
    deskNotes: [{ title: 'N1', body: 'NOTE-BODY' }],
    previousNote: { title: 'W', body: 'PREVIOUS-SYNTHESIS' },
  });
  assert.match(prompt, /=== The brief/);
  assert.match(prompt, /Current focus\./);
  assert.match(prompt, /Desk thing: a\.txt/);
  assert.match(prompt, /CONTENT-A/);
  assert.match(prompt, /Desk note: "N1"/);
  assert.match(prompt, /PREVIOUS-SYNTHESIS/);
  assert.match(prompt, /evolve it, do not start from scratch/);
  assert.match(prompt, /TITLE: /);
});

test('note revision prompt shares the direction, current text, and re-read sources honestly', () => {
  const prompt = prompts.reviseNotePrompt(context, {
    note: { title: 'Hinge notes', body: 'CURRENT-NOTE-BODY' },
    direction: 'Fold in the new measurements and drop the paint question.',
    readings: [
      {
        thing: { displayName: 'plan.txt', type: 'file', status: 'missing', path: 'C:\\real\\plan.txt' },
        content: { text: '(could not read: ENOENT)' },
      },
    ],
  });
  assert.match(prompt, /revise the Backpack note "Hinge notes" in place/);
  assert.match(prompt, /evolve it, do not start from scratch/);
  assert.match(prompt, /The creator's direction, in their words/);
  assert.match(prompt, /Fold in the new measurements and drop the paint question\./);
  assert.match(prompt, /CURRENT-NOTE-BODY/);
  assert.match(prompt, /plan\.txt \(file, missing, at C:\\real\\plan\.txt\)/); // reality re-read, not remembered
  assert.match(prompt, /could not read: ENOENT/);
  assert.match(prompt, /Follow the creator's direction\./);
  assert.match(prompt, /TITLE: /);
});

test('note revision without a direction asks for an honest update, not an invention', () => {
  const prompt = prompts.reviseNotePrompt(context, {
    note: { title: 'Hinge notes', body: 'CURRENT-NOTE-BODY' },
    direction: null,
    readings: [],
  });
  assert.match(prompt, /No specific direction was given/);
  assert.match(prompt, /carrying forward what is still true/);
  assert.ok(!prompt.includes("The creator's direction"));
});

test('note revision propagates runtime failure instead of inventing a revision', async () => {
  await withEnv({ PAPERS_ENGINE: 'imaginary-runtime' }, async () => {
    const result = await engine.reviseNote(context, {
      note: { title: 'T', body: 'B' },
      direction: 'shorter',
      readings: [],
    });
    assert.equal(result.ok, false);
    assert.match(result.error, /imaginary-runtime/);
    assert.equal(result.body, undefined);
  });
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
