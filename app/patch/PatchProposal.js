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
    providerStatus: 'pending', papersStatus: 'pending', capture: clone(input.capture),
    provider: input.provider || 'codex', model: input.model || null,
  };
  return Object.freeze(proposal);
}
function publicProposal(p) {
  return clone({ proposalId:p.proposalId, threadId:p.threadId, turnId:p.turnId, itemId:p.itemId,
    approvalRequestId:p.approvalRequestId, affectedPaths:p.affectedPaths, rawDiff:p.rawDiff,
    createdAt:p.createdAt, providerStatus:p.providerStatus, papersStatus:p.papersStatus,
    boundary:'inside', validationStatus:'captured', requestedProviderAction:'decline' });
}
module.exports = { createProposal, publicProposal };
