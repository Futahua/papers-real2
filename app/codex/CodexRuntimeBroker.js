'use strict';

// The Codex runtime broker: the one trusted orchestrator in the main process.
// It composes the transport, home manager, auth, approval coordinator, event
// reducer/journal, execution policy, network gate, supervisor, and thread
// manager into a small, honest API the IPC layer can call.
//
// Every Gate A finding is enforced here or in the modules it composes:
//   dedicated home + verification, model pin + verification, effective-sandbox
//   authority, approval-before-action, denial enforcement, event dedup,
//   truthful terminals, fail-closed network, exact-PID shutdown.

const { EventEmitter } = require('node:events');
const { buildConfig } = require('./config');
const { AppServerTransport } = require('./AppServerTransport');
const { CodexHomeManager } = require('./CodexHomeManager');
const { CodexAuthManager } = require('./CodexAuthManager');
const { ApprovalCoordinator } = require('./ApprovalCoordinator');
const { EventJournal } = require('./EventJournal');
const { EventReducer } = require('./EventReducer');
const { ExecutionPolicy } = require('./ExecutionPolicy');
const { NetworkIsolationGate } = require('./NetworkIsolationGate');
const { ProcessSupervisor } = require('./ProcessSupervisor');
const { ThreadSessionManager } = require('./ThreadSessionManager');
const { RuntimeStateMachine } = require('./RuntimeStateMachine');
const { CLIENT_METHOD, SANDBOX_MODE, APPROVAL_POLICY } = require('./protocol/constants');
const { validateEffectiveSandbox, validateSelectedModel } = require('./protocol/validators');
const { classifyBoundary } = require('./protocol/paths');
const { CodexError, CODE, classifyServerError } = require('./CodexErrors');
const { safeClone } = require('./protocol/redact');

class CodexRuntimeBroker extends EventEmitter {
  // opts: { config?, userDataDir?, env?, transportFactory? }
  constructor(opts) {
    super();
    opts = opts || {};
    this.config = opts.config || buildConfig({ userDataDir: opts.userDataDir, env: opts.env });
    this.baseEnv = opts.env || process.env;
    this.transportFactory = opts.transportFactory ||
      ((cfg, env) => new AppServerTransport(cfg, env));

    this.home = new CodexHomeManager(this.config);
    this.journal = new EventJournal(this.config.eventJournalLimit);
    this.reducer = new EventReducer();
    this.networkGate = new NetworkIsolationGate();
    this.policy = new ExecutionPolicy(this.networkGate);
    this.supervisor = new ProcessSupervisor();
    this.threads = new ThreadSessionManager(this.config);
    this.machine = new RuntimeStateMachine((a) => this._anomaly(a));

    this.transport = null;
    this.auth = null;
    this.approvals = null;

    this.activeThreadId = null;
    this.activeTurnId = null;
    this.activeWorkspace = null;
    this.effectiveSandbox = null;
    this.effectiveNetworkAccess = false;
    this.lastError = null;
    this.lastSelectedModel = null;
  }

  // --- lifecycle ---------------------------------------------------------
  async start() {
    this.machine.to('starting');
    this.home.ensure();
    const env = this.home.childEnv(this.baseEnv);
    this.auth = new CodexAuthManager(this.config, env);
    this.transport = this.transportFactory(this.config, env);
    this._wireTransport();

    let pid;
    try { pid = this.transport.start(); }
    catch (err) { this._fail(err); throw err; }
    this.supervisor.registerAppServer(this.transport.supervisionSnapshot());

    let init;
    try {
      init = await this.transport.request(CLIENT_METHOD.INITIALIZE,
        { clientInfo: { name: 'papers', title: 'Papers', version: '1' } },
        this.config.startupTimeoutMs);
    } catch (err) { this._fail(err); throw err; }

    // Home must be exactly ours (normalized). Otherwise hard-fail.
    try { this.home.verifyReportedHome(init); }
    catch (err) { this._fail(err); await this.stop(); throw err; }

    this.transport.notify(CLIENT_METHOD.INITIALIZED, {});
    this.approvals = new ApprovalCoordinator({
      respond: (id, payload) => this.transport.respond(id, payload),
      emit: (evt) => this._emitApproval(evt),
      acceptEnabled: this.config.approvalAcceptEnabled,
      journal: this.journal,
    });

    this.machine.to('ready');
    this.emit('runtime-status', this.getRuntimeStatus());
    return { pid, codexHomeVerified: true };
  }

  async stop() {
    this.machine.to('stopping');
    if (this.approvals) this.approvals.clearPending('shutdown');
    let result = { exited: true, forced: false };
    if (this.transport) {
      result = await this.transport.shutdown();
      this.supervisor.updateAppServer(this.transport.supervisionSnapshot());
    }
    this.machine.to('stopped');
    this.emit('runtime-status', this.getRuntimeStatus());
    return result;
  }

  // --- auth --------------------------------------------------------------
  async getAuthStatus() { return this.auth ? this.auth.getStatus() : { state: 'unknown' }; }
  beginAuth() { return this.auth ? this.auth.beginAuthentication() : { state: 'unknown' }; }
  async logout() { return this.auth ? this.auth.logout() : { state: 'unknown' }; }

  // --- task execution ----------------------------------------------------
  // Start one model turn. Enforces: offline gate, model pin+verify,
  // effective-sandbox capture. Returns { threadId, turnId, effectiveSandbox }.
  async startTask(input) {
    if (this.machine.snapshot() !== 'ready') {
      throw new CodexError(CODE.PROTOCOL_INTEGRITY_ERROR,
        'Papers runtime is not ready to start a task.', { state: this.machine.snapshot() });
    }
    // Fail closed if guaranteed-offline was requested and we cannot provide it.
    this.policy.assertOfflineTaskAllowed(input.requireOffline);

    const workspace = input.workspace;
    this.activeWorkspace = workspace;

    const started = await this.transport.request(CLIENT_METHOD.THREAD_START, {
      cwd: workspace,
      model: this.config.model,
      sandbox: SANDBOX_MODE.WORKSPACE_WRITE,
      approvalPolicy: APPROVAL_POLICY.ON_REQUEST,
      ephemeral: true,
    });

    // Model must match exactly; otherwise discard the thread.
    const modelCheck = validateSelectedModel(started, this.config.model);
    this.lastSelectedModel = modelCheck.selected;
    if (!modelCheck.ok) {
      throw new CodexError(CODE.MODEL_MISMATCH,
        'Codex selected a different model than Papers requested; the task was not started.',
        { requested: modelCheck.requested, selected: modelCheck.selected });
    }

    // Effective sandbox is authoritative — never the request.
    const sandbox = validateEffectiveSandbox(started);
    this.effectiveSandbox = sandbox.effectiveType;
    this.effectiveNetworkAccess = sandbox.networkAccess;
    if (!sandbox.ok && sandbox.effectiveType === null) {
      throw new CodexError(CODE.PROTOCOL_INTEGRITY_ERROR,
        'Codex did not report a usable sandbox; Papers will not start the turn.', { reason: sandbox.reason });
    }

    const threadId = (started.thread && started.thread.id) || null;
    this.activeThreadId = threadId;
    this.threads.remember({ threadId, workspace, model: this.lastSelectedModel });

    this.machine.to('running');
    await this.transport.request(CLIENT_METHOD.TURN_START, {
      threadId,
      input: [{ type: 'text', text: input.instruction }],
    });

    this.emit('runtime-status', this.getRuntimeStatus());
    return {
      threadId,
      effectiveSandbox: this.effectiveSandbox,
      effectiveReadOnly: sandbox.readOnly,
      networkAccess: this.effectiveNetworkAccess,
      networkPolicyStatement: this.networkGate.policyStatement(this.effectiveNetworkAccess),
    };
  }

  submitApprovalDecision(approvalId, decision) {
    if (!this.approvals) throw new CodexError(CODE.APPROVAL_PROTOCOL_ERROR, 'No approval coordinator.');
    const r = this.approvals.submitDecision(approvalId, decision);
    if (this.approvals.pendingCount() === 0 && this.machine.snapshot() === 'waitingForApproval') {
      this.machine.to('running');
    }
    this.emit('runtime-status', this.getRuntimeStatus());
    return r;
  }

  // Conservative cancellation. Sends one interrupt; verifies via terminal
  // evidence; never claims success from acceptance alone.
  async cancelTask(threadId, turnId) {
    const tid = threadId || this.activeThreadId;
    const uid = turnId || this.activeTurnId;
    if (!tid || !uid) {
      throw new CodexError(CODE.CANCEL_UNVERIFIED, 'No active turn to cancel.');
    }
    this.machine.to('interrupting');
    try {
      await this.transport.request(CLIENT_METHOD.TURN_INTERRUPT, { threadId: tid, turnId: uid });
    } catch (err) {
      return { status: 'cancelUnverified', reason: 'interrupt request errored', error: err.toJSON ? err.toJSON() : String(err) };
    }
    // The terminal event (turn/completed with cancelled, or item cancelled)
    // arrives via notifications; the reducer records it. Callers await the
    // runtime status change. We report protocol-level result truthfully.
    const snap = this.reducer.snapshot();
    if (snap.turnStatus === 'cancelled' || snap.turnStatus === 'canceled') {
      return { status: 'cancelled' };
    }
    // No attributable child PID cleanup is guaranteed on this runtime.
    return { status: 'cancelledProtocolLevelOnly',
      note: 'Interrupt requested; descendant-process cleanup is not verified on this runtime.' };
  }

  // --- transport wiring --------------------------------------------------
  _wireTransport() {
    this.transport.on('notification', (msg) => this._onNotification(msg));
    this.transport.on('server-request', (msg) => this._onServerRequest(msg));
    this.transport.on('protocol-anomaly', (a) => this._anomaly(a));
    this.transport.on('transport-error', (err) => this._fail(err));
    this.transport.on('exit', (info) => {
      this.supervisor.updateAppServer(this.transport.supervisionSnapshot());
      this.emit('runtime-status', this.getRuntimeStatus());
      this.emit('app-server-exit', info);
    });
  }

  _onNotification(msg) {
    this.journal.append('in', msg, this._msgMeta(msg));
    const delta = this.reducer.applyNotification(msg);
    // Track turn ids and command pids.
    const params = msg.params || {};
    if (msg.method === 'turn/started') this.activeTurnId = (params.turn && params.turn.id) || this.activeTurnId;
    const item = params.item;
    if (item && item.processId != null) this.supervisor.noteCommandPid(item.processId);
    if (msg.method === 'error') {
      const typed = classifyServerError(params.error || params);
      this.lastError = typed.toJSON();
      this.emit('task-error', this.lastError);
    }
    if (delta && delta.kind === 'turn-completed') {
      if (this.machine.snapshot() === 'running' || this.machine.snapshot() === 'waitingForApproval') {
        this.machine.to('ready');
      }
      this.emit('turn-completed', { status: delta.status });
    }
    this.emit('event-delta', safeClone(delta));
    this.emit('runtime-status', this.getRuntimeStatus());
  }

  _onServerRequest(msg) {
    this.journal.append('in', msg, this._msgMeta(msg));
    // Reducer classifies; approvals coordinator responds.
    const cls = this.reducer.classifyServerRequest(msg.method);
    const result = this.approvals.handleServerRequest(msg, {
      threadId: this.activeThreadId, turnId: this.activeTurnId, workspaceRoot: this.activeWorkspace,
    });
    if (cls === 'approval' && !result.safetyClosed) {
      this.machine.to('waitingForApproval');
    }
    if (result.safetyClosed) {
      this.lastError = result.error.toJSON();
      this.emit('task-error', this.lastError);
    }
    this.emit('runtime-status', this.getRuntimeStatus());
  }

  _emitApproval(evt) {
    if (evt.type === 'approval-request') this.journal.append('note', { method: 'approval/request' }, { note: 'approval-request', itemId: evt.itemId });
    this.emit('approval', safeClone(evt));
  }

  _msgMeta(msg) {
    const p = msg.params || {};
    return {
      method: msg.method,
      threadId: p.threadId || this.activeThreadId || null,
      turnId: p.turnId || this.activeTurnId || null,
      itemId: (p.item && p.item.id) || p.itemId || null,
    };
  }

  _anomaly(a) {
    this.journal.append('note', { method: 'protocol/anomaly' }, { note: JSON.stringify(a).slice(0, 300) });
    this.emit('protocol-anomaly', a);
  }

  _fail(err) {
    this.lastError = err && err.toJSON ? err.toJSON() : { code: 'UNKNOWN', message: String(err) };
    this.machine.to('failed', this.lastError);
    this.emit('runtime-status', this.getRuntimeStatus());
  }

  // --- diagnostics -------------------------------------------------------
  getRuntimeStatus() {
    const sup = this.supervisor.snapshot();
    return {
      state: this.machine.snapshot(),
      codexExecutable: this.config.codexExecutable,
      model: this.config.model,
      lastSelectedModel: this.lastSelectedModel,
      appServerPid: sup.appServer ? sup.appServer.pid : null,
      appServerRunning: sup.appServer ? sup.appServer.running : false,
      stdinClosedNormally: sup.appServer ? sup.appServer.stdinClosedNormally : null,
      forcedTermination: sup.appServer ? sup.appServer.forcedTermination : null,
      requestedSandbox: 'workspace-write',
      effectiveSandbox: this.effectiveSandbox,
      effectiveNetworkAccess: this.effectiveNetworkAccess,
      networkIsolationProvider: this.networkGate.status(),
      networkPolicyStatement: this.networkGate.policyStatement(this.effectiveNetworkAccess),
      pendingApprovals: this.approvals ? this.approvals.pendingCount() : 0,
      activeThreadId: shortId(this.activeThreadId),
      activeTurnId: shortId(this.activeTurnId),
      approvalAcceptEnabled: this.config.approvalAcceptEnabled,
      threadResumeEnabled: this.config.threadResumeEnabled,
      lastError: this.lastError,
      // Never a raw home path in a status that can reach the renderer.
      codexHomeConfigured: true,
    };
  }

  getSanitizedHistory(n) { return this.journal.recent(n); }
  exportDiagnosticBundle() {
    return { runtime: this.getRuntimeStatus(), journal: this.journal.exportBundle(), reducer: this.reducer.snapshot() };
  }
}

function shortId(id) { return id ? String(id).slice(0, 8) : null; }

module.exports = { CodexRuntimeBroker };
