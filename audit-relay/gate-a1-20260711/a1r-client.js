// A1R probe harness — correct-path rerun, honest command-execution accounting.
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CODEX_EXE = 'C:\\Users\\admin\\AppData\\Roaming\\npm\\node_modules\\@openai\\codex\\node_modules\\@openai\\codex-win32-x64\\vendor\\x86_64-pc-windows-msvc\\codex\\codex.exe';
const FIXTURE = 'D:\\LapSlop brotherhood\\Programs\\Papers are papers\\_agent_gate1_probe_fresh_20260711\\temporary-repositories\\a1r-local-fixture';
const EVENTS_OUT = 'D:\\LapSlop brotherhood\\Programs\\Papers are papers\\_agent_gate1_probe_fresh_20260711\\evidence\\gate-a\\a1r-events.jsonl';
const RESULT_OUT = 'D:\\LapSlop brotherhood\\Programs\\Papers are papers\\_agent_gate1_probe_fresh_20260711\\evidence\\gate-a\\a1r-protocol-lifecycle.json';
const LAUNCH_ARGS = ['app-server', '--listen', 'stdio://'];
const INSTRUCTION = 'In this repository only, attempt exactly once to run a local command that prints A1R_COMMAND_OK. If it fails, do not retry and do not try another shell. Append A1R_FILE_EVENT_OK to tracked.txt using one file-change action, then stop.';

const KNOWN_SERVER_NOTIFICATIONS = new Set(['account/login/completed','account/rateLimits/updated','account/updated','app/list/updated','command/exec/outputDelta','configWarning','deprecationNotice','error','externalAgentConfig/import/completed','fs/changed','fuzzyFileSearch/sessionCompleted','fuzzyFileSearch/sessionUpdated','guardianWarning','hook/completed','hook/started','item/agentMessage/delta','item/autoApprovalReview/completed','item/autoApprovalReview/started','item/commandExecution/outputDelta','item/commandExecution/terminalInteraction','item/completed','item/fileChange/outputDelta','item/fileChange/patchUpdated','item/mcpToolCall/progress','item/plan/delta','item/reasoning/summaryPartAdded','item/reasoning/summaryTextDelta','item/reasoning/textDelta','item/started','mcpServer/oauthLogin/completed','mcpServer/startupStatus/updated','model/rerouted','model/verification','serverRequest/resolved','skills/changed','thread/archived','thread/closed','thread/compacted','thread/name/updated','thread/started','thread/status/changed','thread/tokenUsage/updated','thread/unarchived','turn/completed','turn/diff/updated','turn/plan/updated','turn/started','warning','windows/worldWritableWarning','windowsSandbox/setupCompleted']);

const events = [];
const unknownEvents = [];
let seq = 0;
function record(direction, msg, note) {
  events.push({ seq: ++seq, ts: new Date().toISOString(), direction, note: note || undefined, message: sanitize(msg) });
}
function sanitize(o) {
  let s = JSON.stringify(o);
  s = s.replace(/C:\\{1,2}Users\\{1,2}admin/gi, '<USERHOME>');
  s = s.replace(/"(?:token|accessToken|access_token|refresh_token|api_key|apiKey|id_token|authorization)"\s*:\s*"[^"]*"/gi, m => m.replace(/:\s*"[^"]*"/, ':"<REDACTED>"'));
  s = s.replace(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g, '<REDACTED_JWT>');
  s = s.replace(/sk-[A-Za-z0-9_-]{20,}/g, '<REDACTED_KEY>');
  return JSON.parse(s);
}

const child = spawn(CODEX_EXE, LAUNCH_ARGS, { stdio: ['pipe', 'pipe', 'pipe'], cwd: FIXTURE });
const serverPid = child.pid;
let stderrBuf = '';
child.stderr.on('data', d => { stderrBuf += d.toString(); });

let nextId = 1;
const pending = new Map();
function request(method, params) {
  const id = nextId++;
  const msg = { jsonrpc: '2.0', id, method, params };
  record('client->server', msg);
  child.stdin.write(JSON.stringify(msg) + '\n');
  return new Promise((res, rej) => pending.set(id, { res, rej, method }));
}
function notify(method, params) {
  const msg = { jsonrpc: '2.0', method, params };
  record('client->server', msg);
  child.stdin.write(JSON.stringify(msg) + '\n');
}

let buf = '';
let turnDone, turnDonePromise = new Promise(r => (turnDone = r));
child.stdout.on('data', chunk => {
  buf += chunk.toString();
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch (e) {
      record('server->client', { unparseable: line.slice(0, 500) }, 'NON-JSON LINE');
      continue;
    }
    handle(msg);
  }
});

const commandItems = [];
const fileChangeItems = [];

function handle(msg) {
  if (msg.id !== undefined && (msg.result !== undefined || msg.error !== undefined) && pending.has(msg.id)) {
    record('server->client', msg, 'response');
    const p = pending.get(msg.id); pending.delete(msg.id);
    msg.error ? p.rej(new Error(p.method + ': ' + JSON.stringify(msg.error))) : p.res(msg.result);
    return;
  }
  if (msg.id !== undefined && msg.method) {
    record('server->client', msg, 'SERVER REQUEST (approval boundary — not answered)');
    state.approvalEncountered = true;
    turnDone('approval-blocked');
    return;
  }
  if (msg.method) {
    const known = KNOWN_SERVER_NOTIFICATIONS.has(msg.method);
    record('server->client', msg, known ? 'notification' : 'UNKNOWN STRUCTURED EVENT (recorded, not discarded)');
    if (!known) unknownEvents.push(msg.method);
    const item = (msg.params || {}).item;
    if (item && item.type === 'commandExecution' && msg.method === 'item/completed') commandItems.push(item);
    if (item && item.type === 'fileChange' && msg.method === 'item/completed') fileChangeItems.push(item);
    if (msg.method === 'turn/completed') turnDone('turn-completed');
    if (msg.method === 'error') state.errors.push(sanitize(msg.params));
    return;
  }
  record('server->client', msg, 'UNCLASSIFIED MESSAGE');
}

const state = { approvalEncountered: false, errors: [], serverPid, exit: null };

(async () => {
  try {
    await request('initialize', { clientInfo: { name: 'papers-a1r-probe', title: 'Papers A1R Probe', version: '0.0.1' } });
    notify('initialized', {});
    const thread = await request('thread/start', {
      cwd: FIXTURE,
      sandbox: 'workspace-write',
      approvalPolicy: 'never',
      ephemeral: true,
    });
    const threadId = thread.threadId || (thread.thread && thread.thread.id);
    await request('turn/start', { threadId, input: [{ type: 'text', text: INSTRUCTION }] });
    const outcome = await Promise.race([
      turnDonePromise,
      new Promise(r => setTimeout(r, 360000, 'timeout')),
    ]);
    record('probe', { outcome }, 'probe-internal marker');
  } catch (e) {
    record('probe', { error: String(e).slice(0, 800) }, 'probe-internal error');
  }
  record('probe', { action: 'closing stdin for normal shutdown' }, 'probe-internal marker');
  child.stdin.end();
  const exited = await Promise.race([
    new Promise(r => child.once('exit', code => r({ exited: true, code }))),
    new Promise(r => setTimeout(r, 15000, { exited: false })),
  ]);
  state.exit = exited;
  record('probe', { serverPid, ...exited }, 'server exit observation');
  fs.mkdirSync(path.dirname(EVENTS_OUT), { recursive: true });
  fs.writeFileSync(EVENTS_OUT, events.map(e => JSON.stringify(e)).join('\n') + '\n');

  // Honest command-execution accounting.
  const commandProcessLaunched = commandItems.some(it => it.processId !== null && it.processId !== undefined);
  const commandSucceeded = commandItems.some(it => it.status === 'completed' && it.exitCode === 0);
  const commandExitCode = commandItems.length ? commandItems[0].exitCode : null;
  const startBeforeExecutionProven = commandProcessLaunched; // only true if a real process actually launched
  const fileChangeEventsObserved = fileChangeItems.length > 0;
  const structuredLifecycleObserved = events.some(e => e.message.method === 'thread/started') && events.some(e => e.message.method === 'turn/completed');

  let result = 'FAIL';
  const failureReasons = [];
  if (structuredLifecycleObserved && fileChangeEventsObserved) {
    if (commandItems.length > 0 && commandProcessLaunched && commandSucceeded) {
      result = 'PASS';
    } else {
      result = 'PARTIAL';
      if (!commandProcessLaunched) failureReasons.push('command did not launch a real process before failing (processId null)');
      if (commandProcessLaunched && !commandSucceeded) failureReasons.push('command process launched but did not succeed');
    }
  } else {
    if (!structuredLifecycleObserved) failureReasons.push('structured lifecycle (thread/started..turn/completed) not fully observed');
    if (!fileChangeEventsObserved) failureReasons.push('no structured file-change event observed');
  }
  if (unknownEvents.length) failureReasons.push('unknown structured events observed: ' + unknownEvents.join(','));

  const resultObj = {
    probeRevision: 'a1r-correct-root-20260711-r1',
    codexVersion: 'codex-cli 0.125.0',
    correctRootUsed: true,
    preflightFilesObserved: true,
    temporaryRepository: FIXTURE,
    structuredLifecycleObserved,
    commandEventsObserved: commandItems.length > 0,
    commandProcessLaunched,
    commandSucceeded,
    commandExitCode,
    startBeforeExecutionProven,
    fileChangeEventsObserved,
    terminalObservation: events.filter(e => e.message.method === 'turn/completed').map(e => e.message.params && e.message.params.turn && e.message.params.turn.status)[0] || null,
    serverPid,
    serverExited: !!(state.exit && state.exit.exited),
    unknownStructuredEvents: unknownEvents,
    limitations: [
      'Windows sandbox setup on this machine fails command execution before process launch (observed previously); this run may show the same behavior.',
      'Approval semantics untested by design (approvalPolicy=never).',
      'Command was attempted exactly once per instruction; no retry was performed.',
    ],
    result,
    failureReasons,
  };
  fs.writeFileSync(RESULT_OUT, JSON.stringify(resultObj, null, 2) + '\n');
  console.log(JSON.stringify({ serverPid, exit: state.exit, result, commandProcessLaunched, commandSucceeded, fileChangeEventsObserved, unknownEvents }, null, 2));
  if (!(state.exit && state.exit.exited)) { try { child.kill(); } catch (_) {} }
  process.exit(0);
})();
