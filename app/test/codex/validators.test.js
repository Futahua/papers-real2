'use strict';

const test = require('node:test');
const assert = require('node:assert');
const v = require('../../codex/protocol/validators');
const { CodexHomeManager } = require('../../codex/CodexHomeManager');

test('effective sandbox: readOnly reported despite workspace-write requested', () => {
  const r = v.validateEffectiveSandbox({ sandbox: { type: 'readOnly', networkAccess: false } });
  assert.strictEqual(r.effectiveType, 'readOnly');
  assert.strictEqual(r.readOnly, true);
  assert.strictEqual(r.networkAccess, false);
});

test('effective sandbox: missing sandbox fails closed (readOnly, no network)', () => {
  const r = v.validateEffectiveSandbox({});
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.readOnly, true);
  assert.strictEqual(r.networkAccess, false);
});

test('effective sandbox: workspaceWrite honored only when server says so', () => {
  const r = v.validateEffectiveSandbox({ sandbox: { type: 'workspaceWrite', networkAccess: false } });
  assert.strictEqual(r.effectiveType, 'workspaceWrite');
  assert.strictEqual(r.readOnly, false);
});

test('model verification: exact match ok', () => {
  const r = v.validateSelectedModel({ model: 'gpt-5.4-mini' }, 'gpt-5.4-mini');
  assert.strictEqual(r.ok, true);
});

test('model verification: mismatch rejected', () => {
  const r = v.validateSelectedModel({ model: 'gpt-5.3-codex' }, 'gpt-5.4-mini');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.selected, 'gpt-5.3-codex');
});

test('startTask IPC: unknown field rejected', () => {
  assert.throws(() => v.validateStartTask({ workspace: 'D:\\ws', instruction: 'hi', command: 'rm -rf' }), /unknown field/);
});

test('startTask IPC: valid input passes and requireOffline coerced', () => {
  const r = v.validateStartTask({ workspace: 'D:\\ws', instruction: 'do', requireOffline: true });
  assert.strictEqual(r.requireOffline, true);
});

test('approval IPC: only deny/approveOnce accepted', () => {
  assert.throws(() => v.validateApprovalDecision({ approvalId: 'a', decision: 'always' }), /unsupported decision/);
  assert.deepStrictEqual(v.validateApprovalDecision({ approvalId: 'a', decision: 'deny' }), { approvalId: 'a', decision: 'deny' });
});

test('home manager: global .codex identified as global home', () => {
  const home = process.env.USERPROFILE || process.env.HOME;
  if (!home) return;
  assert.ok(CodexHomeManager.isGlobalHome(home + '\\.codex'));
  assert.ok(!CodexHomeManager.isGlobalHome('D:\\papers\\codex-home'));
});

test('home manager: reported home verification uses normalization', () => {
  const mgr = new CodexHomeManager({ codexHome: 'D:\\papers\\codex-home' });
  assert.ok(mgr.verifyReportedHome({ codexHome: '\\\\?\\D:\\papers\\codex-home' }));
  assert.throws(() => mgr.verifyReportedHome({ codexHome: 'D:\\somewhere\\else' }), /different home/);
});
