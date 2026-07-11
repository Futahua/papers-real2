'use strict';

// Controller-level integration tests: the real CodexRuntimeBroker driven by an
// in-process FakeAppServer over the same event contract as the live transport.
// No process is spawned and no network is touched.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { CodexRuntimeBroker } = require('../../codex/CodexRuntimeBroker');
const { FakeAppServer } = require('../../codex/testing/FakeAppServer');
const transcripts = require('../../codex/testing/transcripts');

// A userData dir under the OS temp so ensure() can create the codex-home.
function tmpUserData() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'papers-broker-test-'));
}

function brokerWith(script, env) {
  const userDataDir = tmpUserData();
  const codexHome = path.join(userDataDir, 'codex-home');
  // The fake reports exactly the home the broker will compute, so home
  // verification passes.
  script.codexHome = codexHome;
  let fake;
  const broker = new CodexRuntimeBroker({
    userDataDir,
    env: env || {},
    transportFactory: () => { fake = new FakeAppServer(script); return fake; },
  });
  return { broker, getFake: () => fake, userDataDir };
}

async function waitFor(pred, ms) {
  const deadline = Date.now() + (ms || 1000);
  while (Date.now() < deadline) {
    if (pred()) return true;
    await new Promise((r) => setTimeout(r, 5));
  }
  return pred();
}

test('start verifies home and reaches ready', async () => {
  const { broker } = brokerWith({});
  const res = await broker.start();
  assert.ok(res.codexHomeVerified);
  assert.strictEqual(broker.getRuntimeStatus().state, 'ready');
  await broker.stop();
});

test('home mismatch is a hard startup failure', async () => {
  const { broker } = brokerWith({ initialize: { codexHome: 'D:\\totally\\wrong' } });
  await assert.rejects(() => broker.start(), /different home|HOME_MISMATCH/i);
});

test('model mismatch rejected before turn/start', async () => {
  const { broker } = brokerWith({
    onRequest: (method, params) => {
      if (method === 'thread/start') {
        return { thread: { id: 'th1' }, model: 'gpt-5.3-codex', sandbox: { type: 'readOnly', networkAccess: false }, approvalPolicy: params.approvalPolicy, approvalsReviewer: 'user', cwd: params.cwd };
      }
      return null;
    },
  });
  await broker.start();
  await assert.rejects(() => broker.startTask({ workspace: 'D:\\ws', instruction: 'hi' }), /different model|MODEL_MISMATCH/i);
  await broker.stop();
});

test('outside command approval → denial → declined terminal, no launch inferred', async () => {
  const script = { afterTurnStart: (emit) => transcripts.outsideCommandDenied(emit) };
  const { broker, getFake } = brokerWith(script);
  const approvals = [];
  broker.on('approval', (a) => approvals.push(a));
  await broker.start();
  await broker.startTask({ workspace: 'D:\\ws', instruction: 'write outside' });

  // One approval request should surface.
  await waitFor(() => approvals.some((a) => a.type === 'approval-request'), 1000);
  const req = approvals.find((a) => a.type === 'approval-request');
  assert.ok(req, 'expected an approval request');

  // Deny it.
  broker.submitApprovalDecision(req.approvalId, 'deny');

  // The fake sends declined + turn/completed. Assert exact decline payload was
  // transmitted and no process launch was ever proven.
  await waitFor(() => broker.reducer.turnStatus === 'completed', 1000);
  const decisions = getFake().decisions;
  assert.ok(decisions.some((d) => d.payload && d.payload.decision === 'decline'));
  assert.strictEqual(broker.reducer.processLaunchProven, false);
  const outcome = broker.reducer.commandOutcome('call_cmd_1');
  assert.strictEqual(outcome.outcome, 'declined');
  await broker.stop();
});

test('structured file-change denial does not report mutation applied', async () => {
  const script = { afterTurnStart: (emit) => transcripts.fileChangeDenied(emit) };
  const { broker } = brokerWith(script);
  const approvals = [];
  broker.on('approval', (a) => approvals.push(a));
  await broker.start();
  await broker.startTask({ workspace: 'D:\\ws', instruction: 'append' });
  await waitFor(() => approvals.some((a) => a.type === 'approval-request'), 1000);
  const req = approvals.find((a) => a.type === 'approval-request');
  broker.submitApprovalDecision(req.approvalId, 'deny');
  await waitFor(() => broker.reducer.turnStatus === 'completed', 1000);
  assert.strictEqual(broker.reducer.commandOutcome('call_fc_1').outcome, 'declined');
  await broker.stop();
});

test('offline-required task fails closed before thread/start', async () => {
  const { broker } = brokerWith({});
  await broker.start();
  await assert.rejects(() => broker.startTask({ workspace: 'D:\\ws', instruction: 'x', requireOffline: true }),
    /offline|NETWORK_ISOLATION_UNAVAILABLE/i);
  await broker.stop();
});

test('shutdown closes stdin and records clean exit', async () => {
  const { broker } = brokerWith({});
  await broker.start();
  const r = await broker.stop();
  assert.strictEqual(r.exited, true);
  assert.strictEqual(r.forced, false);
  assert.strictEqual(broker.getRuntimeStatus().state, 'stopped');
});

test('sanitized history contains no credential material', async () => {
  const script = {
    afterTurnStart: (emit) => {
      emit.notification({ jsonrpc: '2.0', method: 'error', params: { error: { message: 'Authorization: Bearer abcdef1234567890 leaked', additionalDetails: null } } });
      emit.notification({ jsonrpc: '2.0', method: 'turn/completed', params: { turn: { id: 't', status: 'failed' } } });
    },
  };
  const { broker } = brokerWith(script);
  await broker.start();
  await broker.startTask({ workspace: 'D:\\ws', instruction: 'x' });
  await waitFor(() => broker.reducer.turnStatus === 'failed', 1000);
  const hist = JSON.stringify(broker.getSanitizedHistory(500));
  assert.ok(!/abcdef1234567890/.test(hist));
  await broker.stop();
});
