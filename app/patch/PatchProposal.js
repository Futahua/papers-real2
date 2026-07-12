'use strict';

const crypto = require('node:crypto');
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function createProposal(input) {
  const proposal = {
    proposalId: input.proposalId || `pp_${crypto.randomUUID()}`,
    threadId: input.threadId, turnId: input.turnId, itemId: input.itemId,
    approvalRequestId: input.approvalRequestId, approvalId: input.approvalId,
    repositoryRoot: input.repositoryRoot, worktreeRoot: input.worktreeRoot,
    rawDiff: input.rawDiff, affectedPaths: [...input.affectedPaths], createdAt: input.createdAt || new Date().toISOString(),
    providerStatus: input.providerStatus || 'pending', papersStatus: 'pending', capture: clone(input.capture),
    provider: input.provider || 'codex', model: input.model || null,
    // Authority model. Structured fileChange proposals require a provider
    // decision (decline-before-apply); provider-message proposals never do.
    proposalSource: input.proposalSource || 'provider-filechange',
    providerActionRequested: input.providerActionRequested !== false,
    providerDecisionRequired: input.providerDecisionRequired !== false,
    messageItemId: input.messageItemId || null,
    turnTerminalConfirmed: input.turnTerminalConfirmed === true,
    summary: input.summary || null,
    // Transport canonicalization truth (provider-message mode only).
    terminalLfAppended: input.terminalLfAppended === true,
    rawProviderDiffSHA256: input.rawProviderDiffSHA256 || null,
  };
  return Object.freeze(proposal);
}
function publicProposal(p) {
  return clone({ proposalId:p.proposalId, threadId:p.threadId, turnId:p.turnId, itemId:p.itemId,
    approvalRequestId:p.approvalRequestId, affectedPaths:p.affectedPaths, rawDiff:p.rawDiff,
    createdAt:p.createdAt, providerStatus:p.providerStatus, papersStatus:p.papersStatus,
    boundary:'inside', validationStatus:'captured',
    proposalSource:p.proposalSource, providerActionRequested:p.providerActionRequested,
    providerDecisionRequired:p.providerDecisionRequired, turnTerminalConfirmed:p.turnTerminalConfirmed,
    summary:p.summary, terminalLfAppended:p.terminalLfAppended,
    requestedProviderAction: p.providerDecisionRequired ? 'decline' : 'none' });
}
module.exports = { createProposal, publicProposal };
