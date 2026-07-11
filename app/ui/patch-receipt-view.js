'use strict';

// Truthful presentation model for Papers patch receipts. Pure functions only —
// no DOM, no Electron — so the renderer and the node test runner share the
// exact same truth rules. The renderer may declare a patch "applied" only when
// isTruthfulReceipt passes; display uses the allowlisted receiptRows so no
// unexpected receipt field (paths, hashes maps, anything credential-shaped)
// can leak into the UI.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PapersPatchReceiptView = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  function nonEmptyString(v) { return typeof v === 'string' && v.trim().length > 0; }

  // A receipt is truthful only when it proves the full Backpack v0 contract:
  // Papers applied after a confirmed provider decline, with verifiable hashes.
  function isTruthfulReceipt(r) {
    return !!(r && typeof r === 'object' && !Array.isArray(r)
      && nonEmptyString(r.receiptId)
      && r.outcome === 'applied-by-papers'
      && r.providerDecision === 'decline'
      && nonEmptyString(r.providerTerminalStatus)
      && Array.isArray(r.affectedPaths) && r.affectedPaths.length > 0
      && r.affectedPaths.every(nonEmptyString)
      && nonEmptyString(r.branch)
      && nonEmptyString(r.headBefore)
      && nonEmptyString(r.patchSHA256)
      && nonEmptyString(r.resultingDiffSHA256)
      && nonEmptyString(r.startedAt)
      && nonEmptyString(r.completedAt));
  }

  // Allowlisted label/value pairs. Anything not named here is never shown.
  function receiptRows(r) {
    if (!isTruthfulReceipt(r)) return [];
    return [
      ['Outcome', r.outcome],
      ['Provider decision', r.providerDecision],
      ['Provider terminal status', r.providerTerminalStatus],
      ['Affected files', r.affectedPaths.join(', ')],
      ['Branch', r.branch],
      ['HEAD before', r.headBefore],
      ['Patch SHA-256', r.patchSHA256],
      ['Resulting diff SHA-256', r.resultingDiffSHA256],
      ['Started', r.startedAt],
      ['Completed', r.completedAt],
    ];
  }

  // Decide the card's resolution from the raw IPC apply result. "applied" is
  // only reachable through a successful result carrying a truthful receipt;
  // a missing or malformed receipt renders as failure even when ok is true.
  function applyResolution(ipcResult) {
    if (ipcResult && ipcResult.ok && isTruthfulReceipt(ipcResult.value)) {
      return { state: 'applied', receipt: ipcResult.value, message: null };
    }
    const message = ipcResult && ipcResult.error && ipcResult.error.message
      ? ipcResult.error.message
      : (ipcResult && ipcResult.ok ? 'Apply finished without a truthful receipt.' : null);
    return { state: 'failed', receipt: null, message };
  }

  // Dedupe by receiptId across the IPC return value, the push event, and the
  // initial listPatchReceipts pull. register() is true exactly once per id.
  function createReceiptLedger() {
    const seen = new Set();
    return {
      register(r) {
        if (!isTruthfulReceipt(r) || seen.has(r.receiptId)) return false;
        seen.add(r.receiptId);
        return true;
      },
    };
  }

  return { isTruthfulReceipt, receiptRows, applyResolution, createReceiptLedger };
});
