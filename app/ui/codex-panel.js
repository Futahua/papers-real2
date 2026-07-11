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

  const root = document.createElement('section');
  root.id = 'codex-panel';
  root.setAttribute('aria-live', 'polite');
  root.hidden = true;
  document.body.appendChild(root);

  const statusBar = el('div', 'codex-statusbar');
  const approvalHost = el('div', 'codex-approvals');
  root.appendChild(statusBar);
  root.appendChild(approvalHost);

  let lastStatus = null;
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
    const card = el('div', 'codex-approval-card'); card.setAttribute('role','alertdialog');
    card.appendChild(el('h3','codex-approval-title','Review proposed file changes'));
    card.appendChild(el('div','codex-boundary codex-inside','Inside disposable worktree boundary'));
    const details=el('div','codex-approval-details');
    details.appendChild(row('Files affected',(p.affectedPaths||[]).join(', ')));
    details.appendChild(row('Patch validation',p.validationStatus||'captured'));
    details.appendChild(row('Requested provider action','Decline'));
    details.appendChild(row('Effective sandbox',lastStatus&&lastStatus.effectiveSandbox));
    card.appendChild(details);
    card.appendChild(el('p','codex-warn-line','Codex will be denied. Papers will apply the reviewed patch directly to the disposable worktree.'));
    const preview=document.createElement('pre');preview.className='codex-diff-preview';preview.textContent=clip(p.rawDiff||'',12000);card.appendChild(preview);
    const buttons=el('div','codex-approval-buttons');
    const applyBtn=el('button','codex-approve codex-primary','Apply safely with Papers');applyBtn.type='button';
    const denyBtn=el('button','codex-deny','Deny change');denyBtn.type='button';
    let decided=false;const disable=()=>{decided=true;applyBtn.disabled=true;denyBtn.disabled=true;};
    applyBtn.addEventListener('click',async()=>{if(decided)return;if(!window.confirm('Codex will be denied. Papers will apply the reviewed patch directly to the disposable worktree.'))return;disable();const r=await api.applyPatchProposal(p.proposalId);showResolution(card,r&&r.ok?'applied':'failed',r&&r.error&&r.error.message);});
    denyBtn.addEventListener('click',async()=>{if(decided)return;disable();const r=await api.denyPatchProposal(p.proposalId);showResolution(card,r&&r.ok?'denied':'failed',r&&r.error&&r.error.message);});
    buttons.appendChild(applyBtn);buttons.appendChild(denyBtn);card.appendChild(buttons);approvalHost.appendChild(card);pendingCards.set(p.proposalId,{card});denyBtn.focus();
  }

  function showResolution(card, state, message) {
    const line = el('div', 'codex-resolution codex-res-' + state,
      state === 'denied' ? 'Denied'
        : state === 'applied' ? 'Applied safely by Papers after provider denial'
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
  api.onPatch((event) => { if (event.type === 'patch-proposal-captured') renderPatchProposal(event.proposal); });

  // Initial pull.
  api.getRuntimeStatus().then((r) => { if (r && r.ok) renderStatus(r.value); }).catch(() => {});
})();
