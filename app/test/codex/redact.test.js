'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { redact, redactString } = require('../../codex/protocol/redact');

test('redact: bearer token in a string', () => {
  const out = redactString('Authorization: Bearer abcdef1234567890abcdef');
  assert.ok(!/abcdef1234567890/.test(out));
  assert.ok(/<REDACTED>/.test(out));
});

test('redact: access/refresh/id token keys masked', () => {
  const out = redact({ access_token: 'x'.repeat(40), refresh_token: 'y'.repeat(40), id_token: 'z'.repeat(40) });
  assert.strictEqual(out.access_token, '<REDACTED>');
  assert.strictEqual(out.refresh_token, '<REDACTED>');
  assert.strictEqual(out.id_token, '<REDACTED>');
});

test('redact: JWT-like value in a message string', () => {
  const jwt = 'eyJhbGciOi.eyJzdWIiOiJ.SflKxwRJSM';
  const out = redactString('token is ' + jwt);
  assert.ok(!out.includes(jwt));
  assert.ok(out.includes('<REDACTED_JWT>'));
});

test('redact: sk- API key', () => {
  const out = redactString('key sk-ABCDEFGHIJKLMNOPQRSTUV');
  assert.ok(out.includes('<REDACTED_KEY>'));
});

test('redact: apiKey object key masked', () => {
  assert.strictEqual(redact({ apiKey: 'secretvalue123456' }).apiKey, '<REDACTED>');
});

test('redact: nested auth JSON masked', () => {
  const out = redact({ auth: { access_token: 'a'.repeat(30), tokens: { refresh_token: 'b'.repeat(30) } } });
  assert.strictEqual(out.auth, '<REDACTED>'); // key "auth" itself is a token key
});

test('redact: user-home path scrubbed when present', () => {
  const home = process.env.USERPROFILE || process.env.HOME;
  if (!home) return; // environment-dependent; skip if absent
  const out = redactString(`${home}\\.codex\\auth.json`);
  assert.ok(out.includes('<USERHOME>'));
  assert.ok(!out.toLowerCase().includes(home.toLowerCase()));
});
