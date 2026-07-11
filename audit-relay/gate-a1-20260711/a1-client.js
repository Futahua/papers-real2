// A1 probe harness — Codex App Server protocol/lifecycle probe (single instance, single turn).
// Node-only, no dependencies. JSON-RPC over newline-delimited JSON on stdio.
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CODEX_EXE = 'C:\\Users\\admin\\AppData\\Roaming\\npm\\node_modules\\@openai\\codex\\node_modules\\@openai\\codex-win32-x64\\vendor\\x86_64-pc-windows-msvc\\codex\\codex.exe';
const FIXTURE = 'D:\\LapSlop brotherhood\\Programs\\Papers are papers_agent_gate1_probe_fresh_20260711\\temporary-repositories\\a1-local-fixture';
const EVENTS_OUT = 'D:\\LapSlop brotherhood\\Programs\\Papers are papers_agent_gate1_probe_fresh_20260711\\evidence\\gate-a\\a1-events.jsonl';
const LAUNCH_ARGS = ['app-server', '--listen', 'stdio://'];
const INSTRUCTION = 'In this temporary repository only, run a harmless local command that prints A1_COMMAND_OK, append a new line containing A1_FILE_EVENT_OK to tracked.txt, then stop. Do not access the network or any path outside this repository.';

// Methods known from the runtime's own generate-json-schema output (v2 protocol).
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

function handle(msg) {
  if (msg.id !== undefined && (msg.result !== undefined || msg.error !== undefined) && pending.has(msg.id)) {
    record('server->client', msg, 'response');
    const p = pending.get(msg.id); pending.delete(msg.id);
    msg.error ? p.rej(new Error(p.method + ': ' + JSON.stringify(msg.error))) : p.res(msg.result);
    return;
  }
  if (msg.id !== undefined && msg.method) {
    // Server-initiated request (e.g. approval). Do NOT approve — record and leave unanswered per A1 rules.
    record('server->client', msg, 'SERVER REQUEST (approval boundary — not answered)');
    state.approvalEncountered = true;
    // End observation: interrupt path is out of scope; mark turn as blocked.
    turnDone('approval-blocked');
    return;
  }
  if (msg.method) {
    const known = KNOWN_SERVER_NOTIFICATIONS.has(msg.method);
    record('server->client', msg, known ? 'notification' : 'UNKNOWN STRUCTURED EVENT (recorded, not discarded)');
    if (!known) unknownEvents.push(msg.method);
    if (msg.method === 'turn/completed') turnDone('turn-completed');
    if (msg.method === 'error') state.errors.push(sanitize(msg.params));
    return;
  }
  record('server->client', msg, 'UNCLASSIFIED MESSAGE');
}

const state = { approvalEncountered: false, errors: [], serverPid, exit: null };

(async () => {
  try {
    const init = await request('initialize', { clientInfo: { name: 'papers-a1-probe', title: 'Papers A1 Probe', version: '0.0.1' } });
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
  // Normal shutdown request for stdio transport: close stdin (EOF).
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
  console.log(JSON.stringify({ serverPid, exit: state.exit, approvalEncountered: state.approvalEncountered, unknownEvents, errors: state.errors, eventCount: events.length, stderrTail: stderrBuf.slice(-800) }, null, 2));
  if (!exited.exited) { try { child.kill(); } catch (_) {} }
  process.exit(0);
})();
