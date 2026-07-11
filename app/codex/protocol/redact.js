'use strict';

// Credential and PII redaction. Everything that leaves the transport toward a
// journal, the renderer, an IPC payload, or a diagnostic bundle passes through
// here first. Redaction is deep and value-based, not just key-based, so a
// token that leaks into a message string is still caught.

// USERPROFILE-derived home; captured once so we can scrub it from paths that
// don't operationally need it. Falls back gracefully off-Windows / in tests.
const USER_HOME = process.env.USERPROFILE || process.env.HOME || '';

const TOKEN_KEY_RE = /^(?:token|accessToken|access_token|refresh_token|refreshToken|api_key|apiKey|id_token|idToken|authorization|auth|secret|password|clientSecret|client_secret)$/i;
const JWT_RE = /eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}/g;
const SK_RE = /sk-[A-Za-z0-9_-]{16,}/g;
const BEARER_RE = /Bearer\s+[A-Za-z0-9._-]{12,}/gi;
const AUTH_HEADER_RE = /(authorization\s*[:=]\s*)[A-Za-z0-9._\- ]{12,}/gi;

function redactString(s) {
  if (typeof s !== 'string' || !s) return s;
  let out = s;
  if (USER_HOME) {
    // Replace both plain and double-backslash-escaped forms of the home path.
    const esc = USER_HOME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(esc, 'gi'), '<USERHOME>');
    const dbl = USER_HOME.replace(/\\/g, '\\\\').replace(/[.*+?^${}()|[\]]/g, '\\$&');
    out = out.replace(new RegExp(dbl, 'gi'), '<USERHOME>');
  }
  out = out.replace(JWT_RE, '<REDACTED_JWT>');
  out = out.replace(SK_RE, '<REDACTED_KEY>');
  out = out.replace(BEARER_RE, 'Bearer <REDACTED>');
  out = out.replace(AUTH_HEADER_RE, '$1<REDACTED>');
  return out;
}

// Deep-redact any JSON-serializable value. Objects/arrays are cloned; keys
// that look like secrets have their values fully masked; all strings are
// scrubbed for embedded token-like material.
function redact(value, depth) {
  depth = depth || 0;
  if (depth > 40) return '<REDACTED_DEPTH>';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redactString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (TOKEN_KEY_RE.test(k)) out[k] = '<REDACTED>';
      else out[k] = redact(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

// Convenience: redact then JSON-clone, guaranteeing the result is a fresh,
// serializable, credential-free structure suitable for IPC.
function safeClone(value) {
  return JSON.parse(JSON.stringify(redact(value)));
}

module.exports = { redact, redactString, safeClone };
