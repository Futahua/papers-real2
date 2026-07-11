'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { ApprovalCoordinator } = require('../../codex/ApprovalCoordinator');
const { SERVER_REQUEST, DECISION } = require('../../codex/protocol/constants');

function makeCoord(acceptEnabled) {
  const responses = [];
  const events = [];
  const coord = new ApprovalCoordinator({
    respond: (id, payload) => responses.push({ id, payload }),
    emit: (e) => events.push(e),
    acceptEnabled: !!acceptEnabled,
  });
  return { coord, responses, events };
}

function cmdReq(id) {
  return { jsonrpc: '2.0', id, method: SERVER_REQUEST.COMMAND_APPROVAL,
    params: { itemId: 'it1', command: 'pwsh -c "..."', cwd: 'D:\\outside' } };
}

test('deny maps to exact {decision:"decline"} payload', () => {
  const { coord, responses, events } = makeCoord(false);
  const { approvalId } = coord.handleServerRequest(cmdReq(5), { threadId: 't', turnId: 'u', workspaceRoot: 'D:\\ws' });
  const openEvt = events.find((e) => e.type === 'approval-request');
  assert.ok(openEvt);
  const r = coord.submitDecision(approvalId, 'deny');
  assert.strictEqual(r.resolution, 'denied');
  assert.deepStrictEqual(responses[0].payload, DECISION.DECLINE);
});

test('duplicate decision on same approval rejected', () => {
  const { coord } = makeCoord(false);
  const { approvalId } = coord.handleServerRequest(cmdReq(6), {});
  coord.submitDecision(approvalId, 'deny');
  assert.throws(() => coord.submitDecision(approvalId, 'deny'), /already/i);
});

test('decision for unknown approval id rejected', () => {
  const { coord } = makeCoord(false);
  assert.throws(() => coord.submitDecision('nope', 'deny'), /no longer pending|not.*pending/i);
});

test('approveOnce refused when acceptance disabled', () => {
  const { coord, responses } = makeCoord(false);
  const { approvalId } = coord.handleServerRequest(cmdReq(7), {});
  assert.throws(() => coord.submitDecision(approvalId, 'approveOnce'), /not been verified|disabled/i);
  // No accept payload was ever sent.
  assert.ok(!responses.some((r) => r.payload && r.payload.decision === 'accept'));
});

test('approveOnce sends accept only when capability enabled', () => {
  const { coord, responses } = makeCoord(true);
  const { approvalId } = coord.handleServerRequest(cmdReq(8), {});
  const r = coord.submitDecision(approvalId, 'approveOnce');
  assert.strictEqual(r.resolution, 'approved');
  assert.deepStrictEqual(responses[0].payload, DECISION.ACCEPT);
});

test('unknown safety-relevant server request auto-declined and flagged', () => {
  const { coord, responses, events } = makeCoord(false);
  const res = coord.handleServerRequest(
    { jsonrpc: '2.0', id: 9, method: 'item/permissions/requestApproval', params: {} }, {});
  assert.ok(res.safetyClosed);
  assert.deepStrictEqual(responses[0].payload, DECISION.DECLINE);
  assert.ok(events.some((e) => e.type === 'safety-declined'));
});

test('clearPending declines anything still open', () => {
  const { coord, responses } = makeCoord(false);
  coord.handleServerRequest(cmdReq(10), {});
  coord.clearPending('shutdown');
  assert.deepStrictEqual(responses[0].payload, DECISION.DECLINE);
  assert.strictEqual(coord.pendingCount(), 0);
});

test('renderer never receives raw credential payload (sanitized request)', () => {
  const { coord, events } = makeCoord(false);
  coord.handleServerRequest({ jsonrpc: '2.0', id: 11, method: SERVER_REQUEST.COMMAND_APPROVAL,
    params: { itemId: 'x', command: 'echo', cwd: 'D:\\ws', access_token: 'sekret-should-not-appear-123456' } }, {});
  const evt = events.find((e) => e.type === 'approval-request');
  const serialized = JSON.stringify(evt);
  assert.ok(!serialized.includes('sekret-should-not-appear'));
});
