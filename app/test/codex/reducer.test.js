'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { EventReducer } = require('../../codex/EventReducer');

function n(method, params) { return { jsonrpc: '2.0', method, params }; }

test('processId:null item/started is intent, not launch', () => {
  const r = new EventReducer();
  r.applyNotification(n('item/started', { item: { id: 'i1', type: 'commandExecution', processId: null, status: 'inProgress' } }));
  assert.strictEqual(r.processLaunchProven, false);
  assert.strictEqual(r.commandOutcome('i1').outcome, 'in-progress');
});

test('declined command reports declined, not success', () => {
  const r = new EventReducer();
  r.applyNotification(n('item/started', { item: { id: 'i1', type: 'commandExecution', processId: null } }));
  r.applyNotification(n('item/completed', { item: { id: 'i1', type: 'commandExecution', status: 'declined', exitCode: -1 } }));
  assert.strictEqual(r.commandOutcome('i1').outcome, 'declined');
});

test('successful command requires launch + exit 0', () => {
  const r = new EventReducer();
  r.applyNotification(n('item/started', { item: { id: 'i1', type: 'commandExecution', processId: 99 } }));
  r.applyNotification(n('item/completed', { item: { id: 'i1', type: 'commandExecution', status: 'completed', exitCode: 0, processId: 99 } }));
  assert.strictEqual(r.commandOutcome('i1').outcome, 'succeeded');
});

test('completed-without-launch is not success', () => {
  const r = new EventReducer();
  r.applyNotification(n('item/started', { item: { id: 'i1', type: 'commandExecution', processId: null } }));
  r.applyNotification(n('item/completed', { item: { id: 'i1', type: 'commandExecution', status: 'completed', exitCode: 0, processId: null } }));
  assert.strictEqual(r.commandOutcome('i1').outcome, 'completed-without-launch');
});

test('duplicate identical completion is one action', () => {
  const r = new EventReducer();
  r.applyNotification(n('item/started', { item: { id: 'i1', type: 'commandExecution', processId: 7 } }));
  const d1 = r.applyNotification(n('item/completed', { item: { id: 'i1', status: 'completed', exitCode: 0, processId: 7, type: 'commandExecution' } }));
  const d2 = r.applyNotification(n('item/completed', { item: { id: 'i1', status: 'completed', exitCode: 0, processId: 7, type: 'commandExecution' } }));
  assert.strictEqual(d1.kind, 'item-completed');
  assert.strictEqual(d2.kind, 'duplicate-completion');
  assert.strictEqual(d2.conflict, false);
  assert.strictEqual(r.snapshot().duplicateCompletions, 1);
  assert.strictEqual(r.protocolIntegrityError, null);
});

test('conflicting duplicate completion is a protocol-integrity failure', () => {
  const r = new EventReducer();
  r.applyNotification(n('item/started', { item: { id: 'i1', type: 'commandExecution', processId: 8 } }));
  r.applyNotification(n('item/completed', { item: { id: 'i1', status: 'completed', exitCode: 0, processId: 8, type: 'commandExecution' } }));
  const d = r.applyNotification(n('item/completed', { item: { id: 'i1', status: 'failed', exitCode: 1, processId: 8, type: 'commandExecution' } }));
  assert.strictEqual(d.conflict, true);
  assert.strictEqual(r.commandOutcome('i1').outcome, 'protocol-integrity-error');
});

test('unknown informational notification retained, not acted on', () => {
  const r = new EventReducer();
  const d = r.applyNotification(n('totally/unknown/event', {}));
  assert.strictEqual(d.kind, 'unknown-notification');
  assert.strictEqual(r.snapshot().unknownEvents.length, 1);
});

test('unknown server request is safety-closed', () => {
  const r = new EventReducer();
  const cls = r.classifyServerRequest('some/unrecognized/serverRequest');
  assert.strictEqual(cls, 'safety-closed');
  assert.ok(r.safetyEvent);
});

test('known approval request classified as approval', () => {
  const r = new EventReducer();
  assert.strictEqual(r.classifyServerRequest('item/commandExecution/requestApproval'), 'approval');
});
