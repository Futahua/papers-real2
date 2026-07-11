'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { ExecutionPolicy } = require('../../codex/ExecutionPolicy');
const { NetworkIsolationGate, UnavailableNetworkIsolationProvider } = require('../../codex/NetworkIsolationGate');
const { CODE } = require('../../codex/CodexErrors');

test('offline-required task rejected before any server request when no provider', () => {
  const gate = new NetworkIsolationGate(new UnavailableNetworkIsolationProvider());
  const policy = new ExecutionPolicy(gate);
  try {
    policy.assertOfflineTaskAllowed(true);
    assert.fail('should have thrown');
  } catch (e) {
    assert.strictEqual(e.code, CODE.NETWORK_ISOLATION_UNAVAILABLE);
  }
});

test('non-offline task is allowed to proceed', () => {
  const gate = new NetworkIsolationGate(new UnavailableNetworkIsolationProvider());
  const policy = new ExecutionPolicy(gate);
  assert.strictEqual(policy.assertOfflineTaskAllowed(false), true);
});

test('network-disabled flag is never presented as guaranteed enforcement', () => {
  const gate = new NetworkIsolationGate(new UnavailableNetworkIsolationProvider());
  const stmt = gate.policyStatement(false);
  assert.ok(/not guaranteed/i.test(stmt));
  assert.ok(!/blocked by verified/i.test(stmt));
});

test('direct command/exec is not reachable with arbitrary argv', () => {
  const gate = new NetworkIsolationGate();
  const policy = new ExecutionPolicy(gate);
  // Only fixed diagnostic IDs resolve; arbitrary ids are rejected.
  assert.throws(() => policy.resolveDiagnostic('rm -rf /'), /Unknown internal diagnostic/);
  const ok = policy.resolveDiagnostic('ECHO_OK');
  assert.ok(Array.isArray(ok.argv));
  // The argv is fixed and internal — not derived from any caller input.
  assert.ok(ok.argv.join(' ').includes('PAPERS_DIAG_OK'));
});

test('renderer command exec is structurally refused', () => {
  assert.throws(() => ExecutionPolicy.rejectRendererCommandExec(), /not available to the interface/);
});
