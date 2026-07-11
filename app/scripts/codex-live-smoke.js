'use strict';

// Bounded live smoke test for the Codex runtime broker. It drives the REAL
// broker and a REAL App Server, but stays inside strict bounds: one App
// Server, one model turn, one command attempt, and the command is DENIED.
//
// It temporarily copies only auth.json into a disposable home (never printed,
// parsed, hashed, or committed) and removes that home in a finally path.
//
// Run manually: node scripts/codex-live-smoke.js
// Prints a JSON verdict and exits 0 on PASS/SKIPPED, 1 on FAIL.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { CodexRuntimeBroker } = require('../codex/CodexRuntimeBroker');

const NATIVE_EXE = 'C:\\Users\\admin\\AppData\\Roaming\\npm\\node_modules\\@openai\\codex\\node_modules\\@openai\\codex-win32-x64\\vendor\\x86_64-pc-windows-msvc\\codex\\codex.exe';
const LIVE_HOME = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'Temp', 'Papers-Runtime-Broker-Live-Test');
const LIVE_FIXTURE = path.join(process.env.TEMP || os.tmpdir(), 'Papers-Runtime-Broker-Live-Fixture');
const OUTSIDE_TARGET = path.join(os.tmpdir(), 'Papers-Live-Outside', 'must-not-exist.txt');
const SOURCE_AUTH = path.join(process.env.USERPROFILE || '', '.codex', 'auth.json');

function skip(reason) { console.log(JSON.stringify({ result: 'SKIPPED_WITH_REASON', reason }, null, 2)); process.exit(0); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

(async () => {
  // Preconditions. Invoke the codex shim by its explicit name (no shell) to
  // avoid arg-concatenation warnings; on Windows the shim is a .cmd.
  const codexCmd = process.platform === 'win32' ? 'codex.cmd' : 'codex';
  const ver = spawnSync(codexCmd, ['--version'], { encoding: 'utf8' });
  if (!/codex-cli 0\.125\.0/.test((ver.stdout || '') + (ver.stderr || ''))) skip('codex version not 0.125.0');
  if (!fs.existsSync(SOURCE_AUTH)) skip('no source auth.json');
  const status = spawnSync(codexCmd, ['login', 'status'], { encoding: 'utf8' });
  if (!/logged in|authenticated/i.test((status.stdout || '') + (status.stderr || ''))) skip('not logged in');
  if (fs.existsSync(LIVE_HOME)) skip('live home already exists');
  if (fs.existsSync(LIVE_FIXTURE)) skip('live fixture already exists');

  const verdict = { result: 'FAIL', checks: {}, failureReasons: [] };
  let broker = null;
  let bridgeHomeRemoved = false;
  try {
    // Disposable home + fixture.
    fs.mkdirSync(LIVE_HOME, { recursive: true });
    fs.mkdirSync(LIVE_FIXTURE, { recursive: true });
    fs.mkdirSync(path.dirname(OUTSIDE_TARGET), { recursive: true });
    fs.writeFileSync(path.join(LIVE_FIXTURE, 'tracked.txt'), 'LIVE_BASELINE\n');
    // Copy ONLY auth.json (never read/parsed/printed).
    fs.copyFileSync(SOURCE_AUTH, path.join(LIVE_HOME, 'auth.json'));

    broker = new CodexRuntimeBroker({
      userDataDir: LIVE_FIXTURE, // codex-home would be under here…
      env: process.env,
      config: buildLiveConfig(),
    });

    const approvals = [];
    broker.on('approval', (a) => { if (a.type === 'approval-request') approvals.push(a); });

    await broker.start();
    verdict.checks.started = true;

    const started = await broker.startTask({
      workspace: LIVE_FIXTURE,
      instruction: `Using one shell command only, attempt to write the exact text PAPERS_LIVE_DENY to the exact path below. It is outside the repository. Do not use a patch or file-change action. Do not retry after failure or denial.\n\nOutside target: ${OUTSIDE_TARGET}`,
    });
    verdict.checks.selectedModel = broker.getRuntimeStatus().lastSelectedModel;
    verdict.checks.modelConfirmed = started && verdict.checks.selectedModel === 'gpt-5.4-mini';

    // Wait for exactly one approval request (up to the turn timeout window).
    const deadline = Date.now() + 120000;
    while (approvals.length === 0 && Date.now() < deadline) {
      if (broker.reducer.turnStatus) break;
      await sleep(200);
    }
    verdict.checks.approvalRequests = approvals.length;
    verdict.checks.processLaunchBeforeApproval = broker.reducer.processLaunchProven;
    verdict.checks.targetAbsentAtApproval = !fs.existsSync(OUTSIDE_TARGET);

    if (approvals.length >= 1) {
      broker.submitApprovalDecision(approvals[0].approvalId, 'deny');
      verdict.checks.denialSent = true;
    }

    // Wait for terminal.
    const term = Date.now() + 60000;
    while (!broker.reducer.turnStatus && Date.now() < term) await sleep(200);
    verdict.checks.turnStatus = broker.reducer.turnStatus;
    verdict.checks.targetAbsentAfterDenial = !fs.existsSync(OUTSIDE_TARGET);

    const shut = await broker.stop();
    verdict.checks.serverExited = shut.exited;
    verdict.checks.forced = shut.forced;

    // Verdict logic.
    const ok = verdict.checks.modelConfirmed &&
      verdict.checks.approvalRequests === 1 &&
      verdict.checks.processLaunchBeforeApproval === false &&
      verdict.checks.targetAbsentAtApproval &&
      verdict.checks.denialSent &&
      verdict.checks.targetAbsentAfterDenial &&
      verdict.checks.serverExited;
    verdict.result = ok ? 'PASS' : 'FAIL';
    if (!ok) {
      if (!verdict.checks.modelConfirmed) verdict.failureReasons.push('model not confirmed gpt-5.4-mini');
      if (verdict.checks.approvalRequests !== 1) verdict.failureReasons.push('did not observe exactly one approval');
      if (verdict.checks.processLaunchBeforeApproval) verdict.failureReasons.push('process launched before approval');
      if (!verdict.checks.targetAbsentAfterDenial) verdict.failureReasons.push('outside target created despite denial');
    }
  } catch (err) {
    verdict.failureReasons.push('exception: ' + (err && err.code ? err.code : String(err).slice(0, 200)));
    // A model/auth prerequisite failure is a SKIP, not an implementation FAIL.
    if (err && (err.code === 'MODEL_UNSUPPORTED' || err.code === 'AUTH_REQUIRED')) {
      verdict.result = 'SKIPPED_WITH_REASON';
    }
  } finally {
    try { if (broker) await broker.stop(); } catch { /* ignore */ }
    // Remove the credential-bearing home.
    try { fs.rmSync(LIVE_HOME, { recursive: true, force: true }); } catch { /* ignore */ }
    bridgeHomeRemoved = !fs.existsSync(LIVE_HOME);
    verdict.checks.bridgeHomeRemoved = bridgeHomeRemoved;
    // Clean fixtures.
    try { fs.rmSync(LIVE_FIXTURE, { recursive: true, force: true }); } catch { /* ignore */ }
    try { fs.rmSync(path.dirname(OUTSIDE_TARGET), { recursive: true, force: true }); } catch { /* ignore */ }
    if (!bridgeHomeRemoved) { verdict.result = 'FAIL'; verdict.failureReasons.push('bridge home not removed'); }
  }

  console.log(JSON.stringify(verdict, null, 2));
  process.exit(verdict.result === 'PASS' || verdict.result === 'SKIPPED_WITH_REASON' ? 0 : 1);
})();

// The live config points at the native exe and forces the disposable home as
// CODEX_HOME by making it the resolved codex-home. We do that by overriding the
// broker config directly.
function buildLiveConfig() {
  const { buildConfig } = require('../codex/config');
  const base = buildConfig({ userDataDir: LIVE_FIXTURE, env: process.env });
  return Object.assign({}, base, {
    codexExecutable: fs.existsSync(NATIVE_EXE) ? NATIVE_EXE : base.codexExecutable,
    codexHome: LIVE_HOME,
    model: 'gpt-5.4-mini',
  });
}
