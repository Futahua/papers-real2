'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { normalizeWinPath, samePath, classifyBoundary } = require('../../codex/protocol/paths');

test('normalizeWinPath: normal path', () => {
  assert.strictEqual(normalizeWinPath('D:\\ws\\a'), 'd:\\ws\\a');
});

test('normalizeWinPath: extended-length \\\\?\\ prefix stripped', () => {
  assert.strictEqual(normalizeWinPath('\\\\?\\D:\\ws\\a'), 'd:\\ws\\a');
});

test('normalizeWinPath: case-insensitive equality', () => {
  assert.strictEqual(normalizeWinPath('D:\\WS\\A'), normalizeWinPath('d:\\ws\\a'));
});

test('normalizeWinPath: trailing separators removed (non-root)', () => {
  assert.strictEqual(normalizeWinPath('D:\\ws\\a\\\\'), 'd:\\ws\\a');
});

test('normalizeWinPath: drive root keeps its separator', () => {
  assert.strictEqual(normalizeWinPath('D:\\'), 'd:\\');
});

test('normalizeWinPath: empty/invalid returns null', () => {
  assert.strictEqual(normalizeWinPath(''), null);
  assert.strictEqual(normalizeWinPath(null), null);
});

test('samePath: extended-length vs plain forms match', () => {
  assert.ok(samePath('\\\\?\\D:\\home\\codex', 'D:\\home\\codex'));
});

test('samePath: unrelated paths differ', () => {
  assert.ok(!samePath('D:\\a', 'D:\\b'));
});

test('classifyBoundary: sibling prefix is not inside (ws vs ws-other)', () => {
  // Neither exists on disk; classifier falls back to unknown OR resolves
  // ancestors. In both cases a sibling must never be "inside".
  const r = classifyBoundary('D:\\does-not-exist-ws', 'D:\\does-not-exist-ws-other\\x');
  assert.notStrictEqual(r, 'inside');
});
