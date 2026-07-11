'use strict';

// Transcript fixtures modeled on the verified Gate A event shapes. IDs and
// paths are synthetic (no real user data). Each transcript is a function that,
// given the fake server's emitter and the turn params, plays a scripted
// server->client sequence.

const THREAD = 'th_test_1';
const TURN = 'tn_test_1';

// The canonical outside-command approval + denial sequence (A2.1-R4 shape):
// item/started (processId null) -> requestApproval -> [client declines] ->
// item/completed declined -> turn/completed completed.
function outsideCommandDenied(emit) {
  const itemId = 'call_cmd_1';
  emit.notification({ jsonrpc: '2.0', method: 'turn/started', params: { turn: { id: TURN } } });
  emit.notification({ jsonrpc: '2.0', method: 'item/started', params: { item: { id: itemId, type: 'commandExecution', command: 'pwsh -Command "Set-Content ..."', processId: null, status: 'inProgress' } } });
  const reqId = emit.serverRequest({ jsonrpc: '2.0', method: 'item/commandExecution/requestApproval', params: { itemId, threadId: THREAD, turnId: TURN, command: 'pwsh -Command "Set-Content -LiteralPath D:/outside/x.txt"', cwd: 'D:/outside' } });
  // The broker will respond with decline; then the server completes declined.
  setImmediate(() => {
    emit.notification({ jsonrpc: '2.0', method: 'item/completed', params: { item: { id: itemId, type: 'commandExecution', status: 'declined', exitCode: -1, processId: null } } });
    emit.notification({ jsonrpc: '2.0', method: 'turn/completed', params: { turn: { id: TURN, status: 'completed' } } });
  });
  return reqId;
}

// Structured file-change approval + denial: the file is never mutated.
function fileChangeDenied(emit) {
  const itemId = 'call_fc_1';
  emit.notification({ jsonrpc: '2.0', method: 'turn/started', params: { turn: { id: TURN } } });
  emit.notification({ jsonrpc: '2.0', method: 'item/started', params: { item: { id: itemId, type: 'fileChange', status: 'inProgress', changes: [{ path: 'D:/ws/tracked.txt', diff: '@@ +GATE_A_FILE_CHANGE_OK' }] } } });
  emit.serverRequest({ jsonrpc: '2.0', method: 'item/fileChange/requestApproval', params: { itemId, threadId: THREAD, turnId: TURN, changes: [{ path: 'D:/ws/tracked.txt' }] } });
  setImmediate(() => {
    emit.notification({ jsonrpc: '2.0', method: 'item/completed', params: { item: { id: itemId, type: 'fileChange', status: 'declined' } } });
    emit.notification({ jsonrpc: '2.0', method: 'turn/completed', params: { turn: { id: TURN, status: 'completed' } } });
  });
}

// A successful inside command: real processId, exit 0.
function successfulCommand(emit) {
  const itemId = 'call_ok_1';
  emit.notification({ jsonrpc: '2.0', method: 'turn/started', params: { turn: { id: TURN } } });
  emit.notification({ jsonrpc: '2.0', method: 'item/started', params: { item: { id: itemId, type: 'commandExecution', processId: 4242, status: 'inProgress' } } });
  emit.notification({ jsonrpc: '2.0', method: 'item/completed', params: { item: { id: itemId, type: 'commandExecution', status: 'completed', exitCode: 0, processId: 4242 } } });
  emit.notification({ jsonrpc: '2.0', method: 'turn/completed', params: { turn: { id: TURN, status: 'completed' } } });
  return itemId;
}

// Duplicate identical completion for one item (benign protocol quirk).
function duplicateCompletion(emit) {
  const itemId = 'call_dup_1';
  emit.notification({ jsonrpc: '2.0', method: 'item/started', params: { item: { id: itemId, type: 'commandExecution', processId: 7, status: 'inProgress' } } });
  emit.notification({ jsonrpc: '2.0', method: 'item/completed', params: { item: { id: itemId, type: 'commandExecution', status: 'completed', exitCode: 0, processId: 7 } } });
  emit.notification({ jsonrpc: '2.0', method: 'item/completed', params: { item: { id: itemId, type: 'commandExecution', status: 'completed', exitCode: 0, processId: 7 } } });
  emit.notification({ jsonrpc: '2.0', method: 'turn/completed', params: { turn: { id: TURN, status: 'completed' } } });
  return itemId;
}

// Conflicting duplicate completion (protocol-integrity failure).
function conflictingCompletion(emit) {
  const itemId = 'call_conf_1';
  emit.notification({ jsonrpc: '2.0', method: 'item/started', params: { item: { id: itemId, type: 'commandExecution', processId: 8, status: 'inProgress' } } });
  emit.notification({ jsonrpc: '2.0', method: 'item/completed', params: { item: { id: itemId, type: 'commandExecution', status: 'completed', exitCode: 0, processId: 8 } } });
  emit.notification({ jsonrpc: '2.0', method: 'item/completed', params: { item: { id: itemId, type: 'commandExecution', status: 'failed', exitCode: 1, processId: 8 } } });
  return itemId;
}

module.exports = {
  THREAD, TURN,
  outsideCommandDenied, fileChangeDenied, successfulCommand,
  duplicateCompletion, conflictingCompletion,
};
