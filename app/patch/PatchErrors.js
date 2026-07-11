'use strict';

const PATCH_CODE = Object.freeze({
  UNKNOWN_PROPOSAL: 'PATCH_UNKNOWN_PROPOSAL', STALE: 'PATCH_STALE', ALREADY_RESOLVED: 'PATCH_ALREADY_RESOLVED',
  INVALID: 'PATCH_INVALID', UNSAFE_PATH: 'PATCH_UNSAFE_PATH', DIRTY_WORKTREE: 'PATCH_DIRTY_WORKTREE',
  WORKTREE_DRIFT: 'PATCH_WORKTREE_DRIFT', PROVIDER_DECLINE_UNCONFIRMED: 'PATCH_PROVIDER_DECLINE_UNCONFIRMED',
  PROVIDER_CONFLICT: 'PATCH_PROVIDER_CONFLICT', LOCKED: 'PATCH_WORKTREE_LOCKED', APPLY_FAILED: 'PATCH_APPLY_FAILED',
  INTEGRITY_FAILURE: 'PATCH_INTEGRITY_FAILURE', PROHIBITED_WORKTREE: 'PATCH_PROHIBITED_WORKTREE',
});
class PatchError extends Error {
  constructor(code, message, detail) { super(message); this.name = 'PatchError'; this.code = code; this.detail = detail || null; }
  toJSON() { return { code: this.code, message: this.message, detail: this.detail }; }
}
module.exports = { PATCH_CODE, PatchError };
