// A2.0B probe harness — App Server direct command/exec differential probe. No thread, no model turn.
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CODEX_EXE = 'C:\\Users\\admin\\AppData\\Roaming\\npm\\node_modules\\@openai\\codex\\node_modules\\@openai\\codex-win32-x64\\vendor\\x86_64-pc-windows-msvc\\codex\\codex.exe';
const WORKSPACE = 'D:\\LapSlop brotherhood\\Programs\\Papers are papers\\_agent_gate1_probe_fresh_20260711\\temporary-repositories\\a2-appserver-exec-fixture';
const EVENTS_OUT = 'D:\\LapSlop brotherhood\\Programs\\Papers are papers\\_agent_gate1_probe_fresh_20260711\\evidence\\gate-a\\a2-appserver-exec-events.jsonl';
const LAUNCH_ARGS = ['app-server', '--listen', 'stdio://'];
const COMMAND_ARGV = ['C:\\Program Files\\PowerShell\\7\\pwsh.exe', '-NoProfile', '-Command', 'Write-Output A2_APPSERVER_EXEC_OK'];

const KNOWN_NOTIFICATIONS = new Set(['account/login/completed','account/rateLimits/updated','account/updated','app/list/updated','command/exec/outputDelta','configWarning','deprecationNotice','error','externalAgentConfig/import/completed','fs/changed','fuzzyFileSearch/sessionCompleted','fuzzyFileSearch/sessionUpdated','guardianWarning','hook/completed','hook/started','item/agentMessage/delta','item/autoApprovalReview/completed','item/autoApprovalReview/started','item/commandExecution/outputDelta','item/commandExecution/terminalInteraction','item/completed','item/fileChange/outputDelta','item/fileChange/patchUpdated','item/mcpToolCall/progress','item/plan/delta','item/reasoning/summaryPartAdded','item/reasoning/summaryTextDelta','item/reasoning/textDelta','item/started','mcpServer/oauthLogin/completed','mcpServer/startupStatus/updated','model/rerouted','model/verification','serverRequest/resolved','skills/changed','thread/archived','thread/closed','thread/compacted','thread/name/updated','thread/started','thread/status/changed','thread/tokenUsage/updated','thread/unarchived','turn/completed','turn/diff/updated','turn/plan/updated','turn/started','warning','windows/worldWritableWarning','windowsSandbox/setupCompleted']);
const KNOWN_SERVER_REQUESTS = new Set(['item/commandExecution/requestApproval','item/fileChange/requestApproval','item/permissions/requestApproval','item/tool/requestUserInput','item/tool/call','mcpServer/elicitation/request','account/chatgptAuthTokens/refresh']);

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

const child = spawn(CODEX_EXE, LAUNCH_ARGS, { stdio: ['pipe', 'pipe', 'pipe'], cwd: WORKSPACE });
const serverPid = child.pid;
let stderrBuf = '';
child.stderr.on('data', d => { stderrBuf += d.toString(); if (stderrBuf.length > 65536) stderrBuf = stderrBuf.slice(-65536); });

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
function respond(id, result) {
  const msg = { jsonrpc: '2.0', id, result };
  record('client->server', msg, 'approval decision response');
  child.stdin.write(JSON.stringify(msg) + '\n');
}

const state = { approvalRequestObserved: false, denialSent: false, errors: [] };

let buf = '';
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
    msg.error ? p.rej(Object.assign(new Error(p.method + ': ' + JSON.stringify(msg.error)), { rpcError: msg.error })) : p.res(msg.result);
    return;
  }
  if (msg.id !== undefined && msg.method) {
    const known = KNOWN_SERVER_REQUESTS.has(msg.method);
    record('server->client', msg, known ? 'SERVER REQUEST' : 'UNKNOWN SERVER REQUEST (recorded, not discarded)');
    if (!known) unknownEvents.push(msg.method);
    state.approvalRequestObserved = true;
    respond(msg.id, { decision: 'decline' });
    state.denialSent = true;
    return;
  }
  if (msg.method) {
    const known = KNOWN_NOTIFICATIONS.has(msg.method);
    record('server->client', msg, known ? 'notification' : 'UNKNOWN STRUCTURED EVENT (recorded, not discarded)');
    if (!known) unknownEvents.push(msg.method);
    if (msg.method === 'error') state.errors.push(sanitize(msg.params));
    return;
  }
  record('server->client', msg, 'UNCLASSIFIED MESSAGE');
}

(async () => {
  let execResult = null, execError = null;
  try {
    await request('initialize', { clientInfo: { name: 'papers-a2-directexec-probe', title: 'Papers A2.0B Direct-Exec Probe', version: '0.0.1' } });
    notify('initialized', {});
    execResult = await Promise.race([
      request('command/exec', {
        command: COMMAND_ARGV,
        cwd: WORKSPACE,
        sandboxPolicy: { type: 'workspaceWrite', networkAccess: false },
        timeoutMs: 60000,
      }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('probe timeout waiting for command/exec response')), 120000)),
    ]);
    record('probe', { execResult }, 'command/exec final result');
  } catch (e) {
    execError = e.rpcError ? sanitize(e.rpcError) : String(e).slice(0, 1000);
    record('probe', { execError }, 'command/exec error');
  }

  record('probe', { action: 'closing stdin for normal shutdown' }, 'probe-internal marker');
  child.stdin.end();
  const exited = await Promise.race([
    new Promise(r => child.once('exit', code => r({ exited: true, code }))),
    new Promise(r => setTimeout(r, 15000, { exited: false })),
  ]);
  record('probe', { serverPid, ...exited }, 'server exit observation');

  fs.mkdirSync(path.dirname(EVENTS_OUT), { recursive: true });
  fs.writeFileSync(EVENTS_OUT, events.map(e => JSON.stringify(e)).join('\n') + '\n');

  const sanStderr = JSON.parse(JSON.stringify(sanitize({ s: stderrBuf }))).s;
  console.log(JSON.stringify({
    serverPid,
    exit: exited,
    execResult,
    execError,
    approvalRequestObserved: state.approvalRequestObserved,
    denialSent: state.denialSent,
    unknownEvents,
    errors: state.errors,
    stderr: sanStderr,
    eventCount: events.length,
  }, null, 2));
  if (!exited.exited) { try { child.kill(); } catch (_) {} }
  process.exit(0);
})();
