'use strict';

// Typed error taxonomy for the Codex runtime broker. Papers reports what
// actually happened — never "success" inferred from an ambiguous signal, and
// never a provider fault dressed up as a different one. Each code carries a
// human-legible message and, where relevant, sanitized structured detail.

const CODE = Object.freeze({
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  MODEL_UNSUPPORTED: 'MODEL_UNSUPPORTED',
  MODEL_MISMATCH: 'MODEL_MISMATCH',
  SANDBOX_HOME_FAILURE: 'SANDBOX_HOME_FAILURE',
  NETWORK_ISOLATION_UNAVAILABLE: 'NETWORK_ISOLATION_UNAVAILABLE',
  APP_SERVER_START_FAILED: 'APP_SERVER_START_FAILED',
  CODEX_EXECUTABLE_NOT_FOUND: 'CODEX_EXECUTABLE_NOT_FOUND',
  APP_SERVER_EXITED: 'APP_SERVER_EXITED',
  APPROVAL_DECLINED: 'APPROVAL_DECLINED',
  APPROVAL_PROTOCOL_ERROR: 'APPROVAL_PROTOCOL_ERROR',
  COMMAND_PRELAUNCH_FAILED: 'COMMAND_PRELAUNCH_FAILED',
  COMMAND_FAILED: 'COMMAND_FAILED',
  FILE_CHANGE_DECLINED: 'FILE_CHANGE_DECLINED',
  CANCEL_UNVERIFIED: 'CANCEL_UNVERIFIED',
  PROTOCOL_INTEGRITY_ERROR: 'PROTOCOL_INTEGRITY_ERROR',
  UNKNOWN_SAFETY_EVENT: 'UNKNOWN_SAFETY_EVENT',
  HOME_MISMATCH: 'HOME_MISMATCH',
  IPC_REJECTED: 'IPC_REJECTED',
  TIMEOUT: 'TIMEOUT',
});

class CodexError extends Error {
  constructor(code, message, detail) {
    super(message || code);
    this.name = 'CodexError';
    this.code = code;
    // detail must already be sanitized by the caller (no credentials, no
    // raw home paths). Kept small and serializable for IPC/journal.
    this.detail = detail || null;
  }

  toJSON() {
    return { code: this.code, message: this.message, detail: this.detail };
  }
}

// Map a provider/server error notification into the correct typed error.
// Critically: a 401 is auth, a 400 unsupported-model is model config, a
// setup-refresh is a home/sandbox fault — none of these are conflated.
function classifyServerError(errParams) {
  const text = safeText(errParams);
  if (/setup refresh failed/i.test(text)) {
    return new CodexError(CODE.SANDBOX_HOME_FAILURE,
      'The Codex sandbox could not initialize for this home. Papers uses its own isolated Codex home; the global one is known to fail this way.',
      { signature: 'windows sandbox: setup refresh failed' });
  }
  if (/\b401\b|unauthorized/i.test(text)) {
    return new CodexError(CODE.AUTH_REQUIRED,
      'Codex authentication is required. Sign in through Papers before starting a task.');
  }
  if (/is not supported when using codex with a chatgpt account/i.test(text) ||
      (/\b400\b/.test(text) && /model/i.test(text))) {
    return new CodexError(CODE.MODEL_UNSUPPORTED,
      'The configured model is not usable with this account. Papers pins a known-good model and will not silently switch.',
      { hint: 'expected gpt-5.4-mini' });
  }
  return new CodexError(CODE.COMMAND_FAILED,
    'The Codex runtime reported an error.', { signature: firstLine(text) });
}

function safeText(o) {
  try { return typeof o === 'string' ? o : JSON.stringify(o); }
  catch { return String(o); }
}
function firstLine(s) {
  return (s || '').split('\n')[0].slice(0, 200);
}

module.exports = { CODE, CodexError, classifyServerError };
