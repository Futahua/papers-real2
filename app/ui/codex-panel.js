'use strict';

// Codex runtime + approval surface for the renderer. Self-contained and
// defensive: it builds DOM with createElement/textContent only — never
// innerHTML with protocol content — so a crafted command string can never
// inject markup. It presents the runtime state, and when Codex asks to run a
// command or change a file, it presents an approval card whose primary,
// always-available action is Deny.

(function () {
  const api = window.papersCodex;
  if (!api) return; // Codex surface not available; degrade silently.
  const receiptView = window.PapersPatchReceiptView;
  if (!receiptView) return; // Truthful receipt rules are required, not optional.
  const receiptLedger = receiptView.createReceiptLedger();

  const root = document.createElement('section');
  root.id = 'codex-panel';
  root.setAttribute('aria-live', 'polite');
  root.hidden = false;
  document.body.appendChild(root);

  const launcher = el('div', 'codex-statusbar');
  const statusBar = el('div', 'codex-statusbar');
  const approvalHost = el('div', 'codex-approvals');
  root.appendChild(launcher);
  root.appendChild(statusBar);
  root.appendChild(approvalHost);

  let lastStatus = null;
  let authState = 'unknown';
  let selectedWorkspace = null;
  let startPending = false;
  const pendingCards = new Map(); // approvalId -> { card, resolve }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = String(text);
    return e;
  }
  function row(label, value, cls) {
    const r = el('div', 'codex-row' + (cls ? ' ' + cls : ''));
    r.appendChild(el('span', 'codex-k', label));
    r.appendChild(el('span', 'codex-v', value == null ? '—' : String(value)));
    return r;
  }

  const launcherTitle = el('div', 'codex-head', 'Start a Codex task');
  const authLine = row('Codex sign-in status', authState);
  const checkAuthBtn = el('button', 'codex-deny', 'Check sign-in'); checkAuthBtn.type = 'button';
  const beginAuthBtn = el('button', 'codex-deny', 'Sign in to Codex for Papers'); beginAuthBtn.type = 'button';
  const workspaceLine = row('Selected disposable worktree', 'None');
  const chooseWorkspaceBtn = el('button', 'codex-deny', 'Choose worktree'); chooseWorkspaceBtn.type = 'button';
  const instruction = document.createElement('textarea'); instruction.rows = 4; instruction.maxLength = 20000;
  instruction.placeholder = 'Task instruction'; instruction.setAttribute('aria-label', 'Task instruction'); instruction.style.width = '100%';
  const startBtn = el('button', 'codex-approve codex-primary', 'Start task'); startBtn.type = 'button';
  const launcherMessage = el('p', 'codex-warn-line', 'Codex sign-in required.');
  launcher.appendChild(launcherTitle); launcher.appendChild(authLine); launcher.appendChild(checkAuthBtn); launcher.appendChild(beginAuthBtn);
  launcher.appendChild(workspaceLine); launcher.appendChild(chooseWorkspaceBtn); launcher.appendChild(instruction); launcher.appendChild(startBtn); launcher.appendChild(launcherMessage);

  function setLineValue(line, value) { const node = line.querySelector('.codex-v'); if (node) node.textContent = String(value); }
  function runtimeBusy() { return lastStatus && ['starting','running','waitingForApproval','interrupting','stopping'].includes(lastStatus.state); }
  function updateLauncher() {
    setLineValue(authLine, authState); setLineValue(workspaceLine, selectedWorkspace ? selectedWorkspace.workspace : 'None');
    startBtn.disabled = authState !== 'authenticated' || !selectedWorkspace || !instruction.value.trim() || runtimeBusy() || startPending;
    checkAuthBtn.disabled = authState === 'checking'; beginAuthBtn.disabled = authState === 'authenticating'; chooseWorkspaceBtn.disabled = startPending || runtimeBusy();
  }
  checkAuthBtn.addEventListener('click', async () => { authState = 'checking'; launcherMessage.textContent = 'Checking sign-in…'; updateLauncher(); const r = await api.getAuthStatus(); authState = r && r.ok && r.value ? r.value.state : 'failed'; launcherMessage.textContent = authState === 'authenticated' ? 'Authenticated.' : authState === 'unauthenticated' ? 'Codex sign-in required.' : (r && r.ok && r.value && r.value.message) || 'Sign-in check failed.'; updateLauncher(); });
  beginAuthBtn.addEventListener('click', async () => { authState = 'authenticating'; launcherMessage.textContent = 'Preparing isolated Codex sign-in…'; updateLauncher(); const r = await api.beginAuth(); const value = r && r.ok ? r.value : null; authState = value && value.state || 'failed'; launcherMessage.textContent = value && value.copied ? value.instructions : (value && value.message) || 'Codex sign-in could not be prepared.'; updateLauncher(); });
  chooseWorkspaceBtn.addEventListener('click', async () => { launcherMessage.textContent = 'Choose a clean disposable linked Git worktree.'; const r = await api.chooseWorkspace(); if (!r || !r.ok) { selectedWorkspace = null; launcherMessage.textContent = 'Selected folder is not a clean disposable linked worktree.'; } else if (!r.value.canceled) { selectedWorkspace = r.value; launcherMessage.textContent = `Validated ${r.value.branch} at ${String(r.value.head).slice(0,8)}.`; } updateLauncher(); });
  instruction.addEventListener('input', updateLauncher);
  startBtn.addEventListener('click', async () => {
    if (startBtn.disabled || startPending) return; startPending = true; launcherMessage.textContent = lastStatus && lastStatus.state === 'stopped' ? 'Preparing isolated Codex runtime…' : 'Starting task…'; updateLauncher();
    const r = await api.startTask({ workspace: selectedWorkspace.workspace, instruction: instruction.value.trim(), requireOffline: false });
    startPending = false;
    if (r && r.ok) launcherMessage.textContent = 'Waiting for Codex proposal…';
    else if (r && r.error && r.error.code === 'AUTH_REQUIRED') { authState = 'unauthenticated'; launcherMessage.textContent = 'Codex sign-in required.'; }
    else if (r && r.error && /active/i.test(r.error.message || '')) launcherMessage.textContent = 'Another task is already active.';
    else launcherMessage.textContent = 'Task could not start.';
    updateLauncher();
  });
  updateLauncher();

  function renderStatus(s) {
    lastStatus = s;
    root.hidden = false;
    statusBar.replaceChildren();
    const head = el('div', 'codex-head', 'Codex runtime');
    const badge = el('span', 'codex-badge codex-state-' + (s.state || 'unknown'), s.state || 'unknown');
    head.appendChild(badge);
    statusBar.appendChild(head);

    const grid = el('div', 'codex-grid');
    grid.appendChild(row('Model', s.lastSelectedModel || s.model));
    grid.appendChild(row('App Server PID', s.appServerPid));
    grid.appendChild(row('Requested sandbox', s.requestedSandbox));
    const effCls = s.effectiveSandbox && s.effectiveSandbox !== 'workspaceWrite' ? 'codex-warn' : '';
    grid.appendChild(row('Effective sandbox', s.effectiveSandbox, effCls));
    grid.appendChild(row('Network policy', s.networkPolicyStatement, 'codex-warn'));
    grid.appendChild(row('Isolation provider', s.networkIsolationProvider, 'codex-warn'));
    grid.appendChild(row('Pending approvals', s.pendingApprovals));
    grid.appendChild(row('Approve enabled', s.approvalAcceptEnabled ? 'yes' : 'no (unverified)'));
    grid.appendChild(row('Thread resume', s.threadResumeEnabled ? 'enabled' : 'disabled'));
    if (s.lastError) grid.appendChild(row('Last error', s.lastError.code, 'codex-error'));
    statusBar.appendChild(grid);
    updateLauncher();
  }

  function renderApproval(a) {
    if (a.kind === 'fileChange') return; // Papers-owned patch card arrives on the dedicated sanitized channel.
    // One card per approvalId; ignore duplicates.
    if (pendingCards.has(a.approvalId)) return;
    const card = el('div', 'codex-approval-card');
    card.setAttribute('role', 'alertdialog');
    card.setAttribute('aria-label', 'Codex approval request');

    const title = el('h3', 'codex-approval-title',
      a.kind === 'fileChange' ? 'Codex wants to change a file' : 'Codex wants to run a command');
    card.appendChild(title);

    const boundaryCls = a.boundary === 'inside' ? 'codex-inside'
      : a.boundary === 'outside' ? 'codex-outside' : 'codex-unknown';
    const boundary = el('div', 'codex-boundary ' + boundaryCls,
      a.boundary === 'inside' ? 'Inside workspace'
        : a.boundary === 'outside' ? 'OUTSIDE workspace' : 'Boundary unknown');
    card.appendChild(boundary);

    // Sanitized details (already redacted by main). Rendered as text only.
    const req = a.request || {};
    const details = el('div', 'codex-approval-details');
    if (req.command) details.appendChild(row('Command', clip(req.command, 400)));
    if (req.changes) details.appendChild(row('Changes', summarizeChanges(req.changes)));
    if (req.cwd) details.appendChild(row('Working dir', req.cwd));
    if (req.reason) details.appendChild(row('Reason', clip(req.reason, 300)));
    card.appendChild(details);

    // Collapsible technical correlation.
    const tech = document.createElement('details');
    const summary = el('summary', null, 'Technical details');
    tech.appendChild(summary);
    tech.appendChild(row('Thread', a.threadId));
    tech.appendChild(row('Turn', a.turnId));
    tech.appendChild(row('Item', a.itemId));
    card.appendChild(tech);

    // Warnings.
    if (a.boundary !== 'inside') {
      card.appendChild(el('p', 'codex-warn-line',
        'This target is not confirmed inside the workspace. Denying is strongly recommended.'));
    }
    if (lastStatus && lastStatus.effectiveSandbox && lastStatus.effectiveSandbox !== 'workspaceWrite') {
      card.appendChild(el('p', 'codex-warn-line',
        'The sandbox is read-only; this action is only possible because you approve it.'));
    }
    if (lastStatus && lastStatus.networkIsolationProvider === 'unavailable') {
      card.appendChild(el('p', 'codex-warn-line',
        'External network isolation is unavailable on this machine.'));
    }

    const buttons = el('div', 'codex-approval-buttons');
    const denyBtn = el('button', 'codex-deny', 'Deny');
    denyBtn.type = 'button';
    // Deny is primary for anything not confirmed inside.
    if (a.boundary !== 'inside') denyBtn.classList.add('codex-primary');
    const approveBtn = el('button', 'codex-approve', 'Approve once');
    approveBtn.type = 'button';
    if (!a.acceptEnabled) {
      approveBtn.disabled = true;
      approveBtn.title = 'Approval acceptance is disabled because it has not been verified on this runtime.';
    }

    let decided = false;
    const decide = async (decision) => {
      if (decided) return;
      decided = true;
      denyBtn.disabled = true; approveBtn.disabled = true;
      const res = await api.submitApprovalDecision({ approvalId: a.approvalId, decision });
      const state = res && res.ok
        ? (decision === 'deny' ? 'denied' : 'approved')
        : 'failed';
      showResolution(card, state, res && res.error ? res.error.message : null);
    };
    denyBtn.addEventListener('click', () => decide('deny'));
    approveBtn.addEventListener('click', () => decide('approveOnce'));
    buttons.appendChild(denyBtn);
    buttons.appendChild(approveBtn);
    card.appendChild(buttons);

    approvalHost.appendChild(card);
    pendingCards.set(a.approvalId, { card });
    // Focus management: move focus to the safe default (Deny).
    denyBtn.focus();
  }

  function renderPatchProposal(p) {
    if (!p || pendingCards.has(p.proposalId)) return;
    // Two authority models with distinct, truthful wording. A message
    // proposal involves no provider action and therefore no provider denial.
    const isMessage = p.proposalSource === 'provider-message-json';
    const card = el('div', 'codex-approval-card'); card.setAttribute('role','alertdialog');
    card.appendChild(el('h3','codex-approval-title',isMessage?'Review provider proposal':'Review proposed file changes'));
    card.appendChild(el('div','codex-boundary codex-inside','Inside disposable worktree boundary'));
    const details=el('div','codex-approval-details');
    if(isMessage){
      details.appendChild(row('Proposal source','Codex final-message JSON'));
      details.appendChild(row('Provider action requested','No'));
      details.appendChild(row('Provider decision required','No'));
      details.appendChild(row('Turn completed',p.turnTerminalConfirmed?'Yes':'No'));
      if(p.terminalLfAppended)details.appendChild(row('Transport normalization','Added required terminal line ending'));
    }
    details.appendChild(row('Files affected',(p.affectedPaths||[]).join(', ')));
    details.appendChild(row('Patch validation',p.validationStatus||'captured'));
    if(!isMessage)details.appendChild(row('Requested provider action','Decline'));
    details.appendChild(row('Effective sandbox',lastStatus&&lastStatus.effectiveSandbox));
    card.appendChild(details);
    const warnText=isMessage
      ?'Codex did not request permission to modify files and did not apply this change. Papers will independently validate and apply the reviewed proposal to the disposable worktree.'
      :'Codex will be denied. Papers will apply the reviewed patch directly to the disposable worktree.';
    card.appendChild(el('p','codex-warn-line',warnText));
    const preview=document.createElement('pre');preview.className='codex-diff-preview';preview.textContent=clip(p.rawDiff||'',12000);card.appendChild(preview);
    const buttons=el('div','codex-approval-buttons');
    const applyBtn=el('button','codex-approve codex-primary','Apply safely with Papers');applyBtn.type='button';
    const denyBtn=el('button','codex-deny',isMessage?'Discard proposal':'Deny change');denyBtn.type='button';
    const confirmText=isMessage
      ?'Codex has completed without modifying the worktree. Papers will apply this reviewed proposal directly to the disposable worktree.'
      :'Codex will be denied. Papers will apply the reviewed patch directly to the disposable worktree.';
    const appliedLabel=isMessage
      ?'Applied safely by Papers from a reviewed provider proposal'
      :'Applied safely by Papers after provider denial';
    let decided=false;const disable=()=>{decided=true;applyBtn.disabled=true;denyBtn.disabled=true;};
    applyBtn.addEventListener('click',async()=>{if(decided)return;if(!window.confirm(confirmText))return;disable();const r=await api.applyPatchProposal(p.proposalId);const res=receiptView.applyResolution(r);showResolution(card,res.state,res.message,appliedLabel);if(res.receipt)renderReceipt(res.receipt,card);});
    denyBtn.addEventListener('click',async()=>{if(decided)return;disable();const r=await api.denyPatchProposal(p.proposalId);const state=r&&r.ok?(r.value&&r.value.resolution==='discarded'?'discarded':'denied'):'failed';showResolution(card,state,r&&r.error&&r.error.message);});
    buttons.appendChild(applyBtn);buttons.appendChild(denyBtn);card.appendChild(buttons);approvalHost.appendChild(card);pendingCards.set(p.proposalId,{card});denyBtn.focus();
  }

  // Render one truthful receipt exactly once, in the proposal's own card when
  // it is still on screen, otherwise as a standalone card (initial pull after
  // a renderer reload). Malformed receipts never render as success.
  function renderReceipt(receipt, cardHint) {
    if (!receiptLedger.register(receipt)) return;
    const host = cardHint
      || (pendingCards.has(receipt.proposalId) ? pendingCards.get(receipt.proposalId).card : null);
    const section = el('div', 'codex-approval-details codex-receipt');
    section.appendChild(el('div', 'codex-head', 'Papers apply receipt'));
    for (const [label, value] of receiptView.receiptRows(receipt)) section.appendChild(row(label, value));
    if (host) { host.appendChild(section); return; }
    const card = el('div', 'codex-approval-card');
    card.appendChild(el('h3', 'codex-approval-title', 'Applied change receipt'));
    card.appendChild(section);
    approvalHost.appendChild(card);
  }

  function showResolution(card, state, message, appliedLabel) {
    const line = el('div', 'codex-resolution codex-res-' + state,
      state === 'denied' ? 'Denied'
        : state === 'applied' ? (appliedLabel || 'Applied safely by Papers after provider denial')
        : state === 'discarded' ? 'Discarded'
        : state === 'approved' ? 'Approved'
          : state === 'superseded' ? 'Superseded'
            : state === 'expired' ? 'Expired'
              : 'Failed');
    if (message) line.appendChild(el('span', 'codex-res-msg', ' — ' + message));
    card.appendChild(line);
  }

  function resolveFromServer(evt) {
    if (evt.type !== 'approval-resolved') return;
    const entry = pendingCards.get(evt.approvalId);
    if (entry) showResolution(entry.card, evt.resolution, null);
  }

  function summarizeChanges(changes) {
    if (!Array.isArray(changes)) return '(file change)';
    return changes.map((c) => (c && c.path) ? c.path : '(path)').join(', ').slice(0, 400);
  }
  function clip(s, n) { s = String(s); return s.length > n ? s.slice(0, n) + '…' : s; }

  // Wire events.
  api.onRuntimeStatus(renderStatus);
  api.onApproval((a) => {
    if (a.type === 'approval-request') renderApproval(a);
    else resolveFromServer(a);
  });
  api.onTaskError((e) => { if (lastStatus) { lastStatus.lastError = e; renderStatus(lastStatus); } });
  api.onPatch((event) => {
    if (event.type === 'patch-proposal-captured') { launcherMessage.textContent = 'Review the proposed change below.'; renderPatchProposal(event.proposal); }
    else if (event.type === 'patch-apply-completed') renderReceipt(event.receipt);
    else if (event.type === 'proposal-turn-ended') {
      // Terminal launcher truth: never leave "Waiting for Codex proposal…"
      // after the turn has actually ended.
      if (event.outcome === 'captured' || event.outcome === 'structured') launcherMessage.textContent = 'Review the proposed change below.';
      else if (event.outcome === 'rejected') launcherMessage.textContent = 'Codex completed without a valid Papers proposal.' + (event.category ? ' (' + event.category + ')' : '');
      else if (event.outcome === 'no-proposal') launcherMessage.textContent = 'Codex completed without returning a proposal.';
      else if (event.outcome === 'conflict') launcherMessage.textContent = 'Codex produced conflicting proposal forms; nothing will be applied.';
      else if (event.outcome === 'command-suppressed') launcherMessage.textContent = 'Codex requested command execution; no proposal was accepted from this turn.';
      else launcherMessage.textContent = 'Codex turn ended without a proposal (' + String(event.outcome).replace(/^turn-/, '') + ').';
    }
  });

  // Initial pull.
  api.getRuntimeStatus().then((r) => { if (r && r.ok) renderStatus(r.value); }).catch(() => {});
  api.listPatchReceipts().then((r) => {
    if (r && r.ok && Array.isArray(r.value)) for (const receipt of r.value) renderReceipt(receipt);
  }).catch(() => {});
})();
