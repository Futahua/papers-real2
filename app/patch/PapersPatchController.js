'use strict';

const { validateUnifiedDiff } = require('./PatchProposalValidator');
const { createProposal, publicProposal } = require('./PatchProposal');
const { createReceipt } = require('./PatchReceipt');
const { GitPatchApplier } = require('./GitPatchApplier');
const { PATCH_CODE, PatchError } = require('./PatchErrors');

class PapersPatchController {
  constructor(opts={}) { this.approvals=opts.approvals;this.emit=opts.emit||(()=>{});this.journal=opts.journal||null;this.applier=opts.applier||new GitPatchApplier(opts);this.proposals=new Map();this.receipts=[];this.waiters=new Map();this.providerTerminals=new Map();this.staleMs=opts.staleMs||15*60*1000;this.declineTimeoutMs=opts.declineTimeoutMs||5000; }
  capture(input) {
    const stable=`${input.threadId}:${input.turnId}:${input.itemId}`; for(const p of this.proposals.values())if(`${p.threadId}:${p.turnId}:${p.itemId}`===stable)return publicProposal(p);
    const v=validateUnifiedDiff(input.rawDiff); const capture=this.applier.inspect(input.worktreeRoot,v.affectedPaths);
    if(input.repositoryRoot && capture.repositoryRoot.toLowerCase()!==require('node:path').resolve(input.repositoryRoot).toLowerCase())throw new PatchError(PATCH_CODE.PROHIBITED_WORKTREE,'Proposal and selected worktree do not match.');
    const p=createProposal({...input,affectedPaths:v.affectedPaths,rawDiff:v.rawDiff,capture});this.proposals.set(p.proposalId,p);this._event('patchProposalCaptured',p);this.emit({type:'patch-proposal-captured',proposal:publicProposal(p)});return publicProposal(p);
  }
  // Capture a provider-message JSON proposal. No approval, no provider
  // decision path: the diff came from the correlated final-message event and
  // Papers alone will validate and apply it after creator review.
  captureProviderMessage(input) {
    for(const p of this.proposals.values())if(p.proposalSource==='provider-message-json'&&p.turnId===input.turnId&&p.threadId===input.threadId)return publicProposal(p);
    const v=validateUnifiedDiff(input.rawDiff); const capture=this.applier.inspect(input.worktreeRoot,v.affectedPaths);
    if(input.repositoryRoot && capture.repositoryRoot.toLowerCase()!==require('node:path').resolve(input.repositoryRoot).toLowerCase())throw new PatchError(PATCH_CODE.PROHIBITED_WORKTREE,'Proposal and selected worktree do not match.');
    const p=createProposal({...input,itemId:input.messageItemId,affectedPaths:v.affectedPaths,rawDiff:v.rawDiff,capture,
      proposalSource:'provider-message-json',providerActionRequested:false,providerDecisionRequired:false,
      providerStatus:'completed',turnTerminalConfirmed:input.turnTerminalConfirmed===true,
      approvalRequestId:null,approvalId:null});
    this.proposals.set(p.proposalId,p);this._event('patchProposalCaptured',p);this.emit({type:'patch-proposal-captured',proposal:publicProposal(p)});return publicProposal(p);
  }
  // Fail closed when one turn produced both a structured provider action and
  // a message proposal: neither authority model may apply anything.
  invalidateTurnForConflict(threadId,turnId){
    for(const p of this.proposals.values()){
      if(p.threadId!==threadId||p.turnId!==turnId||p.papersStatus!=='pending')continue;
      this._replace(p,{papersStatus:'conflict'});this._event('patchProposalConflict',p);
    }
  }
  list(){return [...this.proposals.values()].map(publicProposal);} get(id){const p=this._require(id);return publicProposal(p);} listReceipts(){return JSON.parse(JSON.stringify(this.receipts));}
  deny(id){
    const p=this._claim(id,'denied');
    if(p.providerDecisionRequired){this.approvals.submitDecision(p.approvalId,'deny');this._replace(p,{papersStatus:'denied',providerStatus:'decline-sent'});return {resolution:'denied'};}
    this._replace(p,{papersStatus:'discarded'});return {resolution:'discarded'};
  }
  async apply(id) {
    const p=this._claim(id,'applying'); const startedAt=new Date().toISOString(); this._event('patchApplyRequested',p);
    if(!p.providerDecisionRequired) return this._applyMessageProposal(p,startedAt);
    try {
      const declineEvidence=this._waitForDecline(p);
      this.approvals.submitDecision(p.approvalId,'deny');this._replace(p,{providerStatus:'decline-sent'});this._event('providerDeclineSent',p);
      const terminal=await declineEvidence;this.waiters.delete(p.proposalId);if(this.providerTerminals.get(p.itemId)==='conflict')throw new PatchError(PATCH_CODE.PROVIDER_CONFLICT,'Provider emitted conflicting terminal evidence.');this._event('providerDeclineConfirmed',p);this._event('patchValidationStarted',p);
      this._event('patchApplyStarted',p);const result=this.applier.apply(p);this._event('patchValidationPassed',p);
      const receipt=createReceipt({proposalId:p.proposalId,provider:p.provider,model:p.model,threadId:p.threadId,turnId:p.turnId,itemId:p.itemId,approvalRequestId:p.approvalRequestId,proposalSource:'provider-filechange',providerActionRequested:true,turnTerminalConfirmed:true,providerDecision:'decline',providerTerminalStatus:terminal,repositoryRoot:'selected-disposable-worktree',branch:p.capture.branch,headBefore:p.capture.head,affectedPaths:p.affectedPaths,preApplyHashes:p.capture.affectedFileHashes,...result,startedAt,completedAt:new Date().toISOString(),outcome:'applied-by-papers',failureCode:null});
      this.receipts.push(receipt);this._replace(p,{providerStatus:terminal,papersStatus:'applied'});this._event('patchApplyCompleted',p);this.emit({type:'patch-apply-completed',receipt});return receipt;
    } catch(err){this._replace(p,{papersStatus:'failed'});this._event('patchApplyFailed',p,{failureCode:err.code||PATCH_CODE.APPLY_FAILED});throw err;}
  }
  // Message-proposal application: no provider denial exists because no
  // provider-side action exists. The approval coordinator is never called.
  _applyMessageProposal(p,startedAt){
    try{
      if(!p.turnTerminalConfirmed)throw new PatchError(PATCH_CODE.INVALID,'Proposal turn completion is not confirmed.');
      this._event('patchValidationStarted',p);this._event('patchApplyStarted',p);
      const result=this.applier.apply(p);this._event('patchValidationPassed',p);
      const receipt=createReceipt({proposalId:p.proposalId,provider:p.provider,model:p.model,threadId:p.threadId,turnId:p.turnId,itemId:p.itemId,messageItemId:p.messageItemId,
        proposalSource:'provider-message-json',providerActionRequested:false,approvalRequestId:null,
        providerDecision:'not-applicable',providerTerminalStatus:'completed',turnTerminalConfirmed:true,
        repositoryRoot:'selected-disposable-worktree',branch:p.capture.branch,headBefore:p.capture.head,
        affectedPaths:p.affectedPaths,preApplyHashes:p.capture.affectedFileHashes,...result,
        startedAt,completedAt:new Date().toISOString(),outcome:'applied-by-papers',failureCode:null});
      this.receipts.push(receipt);this._replace(p,{papersStatus:'applied'});this._event('patchApplyCompleted',p);this.emit({type:'patch-apply-completed',receipt});return receipt;
    }catch(err){this._replace(p,{papersStatus:'failed'});this._event('patchApplyFailed',p,{failureCode:err.code||PATCH_CODE.APPLY_FAILED});throw err;}
  }
  observeProviderEvent(msg){const item=msg&&msg.params&&msg.params.item;if(!item||!item.id)return;const status=item.status;if(!['declined','failed','completed','cancelled','canceled'].includes(status))return;const prior=this.providerTerminals.get(item.id);if(prior&&prior!==status)this.providerTerminals.set(item.id,'conflict');else if(!prior)this.providerTerminals.set(item.id,status);for(const p of this.proposals.values()){if(p.itemId!==item.id)continue;const w=this.waiters.get(p.proposalId);if(!w)continue;if(this.providerTerminals.get(item.id)==='conflict'){this.waiters.delete(p.proposalId);w.reject(new PatchError(PATCH_CODE.PROVIDER_CONFLICT,'Provider emitted conflicting terminal evidence.'));}else if(status==='declined'){w.resolve(status);}else{this.waiters.delete(p.proposalId);w.reject(new PatchError(PATCH_CODE.PROVIDER_CONFLICT,'Provider did not confirm decline.',{status}));}}}
  _waitForDecline(p){return new Promise((resolve,reject)=>{this.waiters.set(p.proposalId,{resolve,reject});setTimeout(()=>{if(this.waiters.delete(p.proposalId))reject(new PatchError(PATCH_CODE.PROVIDER_DECLINE_UNCONFIRMED,'Provider decline was not confirmed.'));},this.declineTimeoutMs).unref?.();});}
  _claim(id,status){const p=this._require(id);if(p.papersStatus!=='pending')throw new PatchError(PATCH_CODE.ALREADY_RESOLVED,'Patch proposal was already decided.');if(Date.now()-Date.parse(p.createdAt)>this.staleMs)throw new PatchError(PATCH_CODE.STALE,'Patch proposal is stale.');return this._replace(p,{papersStatus:status});}
  _replace(p,changes){const next=Object.freeze({...p,...changes});this.proposals.set(p.proposalId,next);return next;}
  _require(id){const p=this.proposals.get(id);if(!p)throw new PatchError(PATCH_CODE.UNKNOWN_PROPOSAL,'Unknown patch proposal.');return p;}
  _event(type,p,extra={}){if(this.journal)this.journal.append('note',{method:`papers/${type}`},{note:type,itemId:p.itemId});this.emit({type,proposalId:p.proposalId,...extra});}
}
module.exports={PapersPatchController};
