'use strict';

// Codex App Server v2 protocol constants, pinned to the runtime Papers has
// actually verified (codex-cli 0.125.0). Every value here was observed in the
// Gate A evidence runs, not guessed. Anything unverified is called out.

// The one model proven to work with the tested ChatGPT-account authentication.
// The clean-home default (gpt-5.3-codex) is rejected 400 for this account, so
// Papers must always pin and verify this explicitly.
const VERIFIED_MODEL = 'gpt-5.4-mini';

const VERIFIED_RUNTIME_VERSION = 'codex-cli 0.125.0';

// Client → server request methods (subset Papers uses).
const CLIENT_METHOD = Object.freeze({
  INITIALIZE: 'initialize',
  INITIALIZED: 'initialized', // notification
  THREAD_START: 'thread/start',
  THREAD_RESUME: 'thread/resume',
  THREAD_READ: 'thread/read',
  TURN_START: 'turn/start',
  TURN_INTERRUPT: 'turn/interrupt',
  COMMAND_EXEC: 'command/exec',
});

// Server → client requests. These are the ones that require a decision from
// Papers. Anything not on this allowlist is treated as safety-relevant and
// fails closed.
const SERVER_REQUEST = Object.freeze({
  COMMAND_APPROVAL: 'item/commandExecution/requestApproval',
  FILE_CHANGE_APPROVAL: 'item/fileChange/requestApproval',
  PERMISSIONS_APPROVAL: 'item/permissions/requestApproval',
  TOOL_INPUT: 'item/tool/requestUserInput',
  TOOL_CALL: 'item/tool/call',
  MCP_ELICITATION: 'mcpServer/elicitation/request',
  CHATGPT_TOKEN_REFRESH: 'account/chatgptAuthTokens/refresh',
});

// The two server requests Papers knows how to answer safely (by declining).
// Everything else in SERVER_REQUEST is denied conservatively but flagged.
const APPROVAL_REQUESTS = Object.freeze([
  SERVER_REQUEST.COMMAND_APPROVAL,
  SERVER_REQUEST.FILE_CHANGE_APPROVAL,
]);

// Known server notification methods. Used to distinguish a genuinely unknown
// (and therefore suspicious) event from an expected one.
const SERVER_NOTIFICATION = Object.freeze(new Set([
  'account/login/completed', 'account/rateLimits/updated', 'account/updated',
  'app/list/updated', 'command/exec/outputDelta', 'configWarning',
  'deprecationNotice', 'error', 'externalAgentConfig/import/completed',
  'fs/changed', 'fuzzyFileSearch/sessionCompleted', 'fuzzyFileSearch/sessionUpdated',
  'guardianWarning', 'hook/completed', 'hook/started',
  'item/agentMessage/delta', 'item/autoApprovalReview/completed',
  'item/autoApprovalReview/started', 'item/commandExecution/outputDelta',
  'item/commandExecution/terminalInteraction', 'item/completed',
  'item/fileChange/outputDelta', 'item/fileChange/patchUpdated',
  'item/mcpToolCall/progress', 'item/plan/delta',
  'item/reasoning/summaryPartAdded', 'item/reasoning/summaryTextDelta',
  'item/reasoning/textDelta', 'item/started', 'mcpServer/oauthLogin/completed',
  'mcpServer/startupStatus/updated', 'model/rerouted', 'model/verification',
  'serverRequest/resolved', 'skills/changed', 'thread/archived', 'thread/closed',
  'thread/compacted', 'thread/name/updated', 'thread/started',
  'thread/status/changed', 'thread/tokenUsage/updated', 'thread/unarchived',
  'turn/completed', 'turn/diff/updated', 'turn/plan/updated', 'turn/started',
  'warning', 'windows/worldWritableWarning', 'windowsSandbox/setupCompleted',
]));

// The exact decision payloads. Denial is the fully verified path; acceptance
// is present in the schema but acceptance-in-practice was not proven in Gate A,
// so it stays gated behind a capability flag (see ApprovalCoordinator).
const DECISION = Object.freeze({
  DECLINE: { decision: 'decline' }, // verified: causes item/completed status=declined
  ACCEPT: { decision: 'accept' }, // schema-valid, acceptance not yet proven live
});

// Sandbox policy types as reported by the runtime.
const SANDBOX_TYPE = Object.freeze({
  READ_ONLY: 'readOnly',
  WORKSPACE_WRITE: 'workspaceWrite',
  DANGER_FULL_ACCESS: 'dangerFullAccess',
  EXTERNAL_SANDBOX: 'externalSandbox',
});

// Sandbox mode strings accepted on thread/start.
const SANDBOX_MODE = Object.freeze({
  READ_ONLY: 'read-only',
  WORKSPACE_WRITE: 'workspace-write',
  DANGER_FULL_ACCESS: 'danger-full-access',
});

const APPROVAL_POLICY = Object.freeze({
  UNTRUSTED: 'untrusted',
  ON_FAILURE: 'on-failure',
  ON_REQUEST: 'on-request',
  NEVER: 'never',
});

module.exports = {
  VERIFIED_MODEL,
  VERIFIED_RUNTIME_VERSION,
  CLIENT_METHOD,
  SERVER_REQUEST,
  APPROVAL_REQUESTS,
  SERVER_NOTIFICATION,
  DECISION,
  SANDBOX_TYPE,
  SANDBOX_MODE,
  APPROVAL_POLICY,
};
