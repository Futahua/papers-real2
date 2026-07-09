'use strict';

// Runtime backend: the locally installed Claude Code CLI in print mode.
// One implementation of the Papers engine contract — not the engine itself.
// Everything Claude-specific (the binary, its sign-in, its flags, its error
// vocabulary) is contained in this file.

const { spawn } = require('node:child_process');

const TIMEOUT_MS = 240000;

const id = 'claude-cli';

function label() {
  return 'claude-cli';
}

function complete(prompt) {
  return new Promise((resolve) => {
    // The prompt travels over stdin only — the command line stays fixed.
    // On Windows the CLI is an npm .cmd shim, which needs cmd.exe to run.
    const [cmd, args] =
      process.platform === 'win32'
        ? ['cmd.exe', ['/c', 'claude', '-p', '--output-format', 'text']]
        : ['claude', ['-p', '--output-format', 'text']];
    let child;
    try {
      child = spawn(cmd, args, { windowsHide: true });
    } catch (err) {
      resolve({ ok: false, error: startFailureMessage(err.message) });
      return;
    }
    let out = '';
    let errOut = '';
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const timer = setTimeout(() => {
      try { child.kill(); } catch {}
      finish({ ok: false, error: 'The AI did not respond in time. Nothing was made up in its place.' });
    }, TIMEOUT_MS);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { errOut += d; });
    child.on('error', (err) => {
      clearTimeout(timer);
      finish({ ok: false, error: startFailureMessage(err.message) });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0 && out.trim()) {
        finish({ ok: true, text: out.trim() });
      } else {
        // The CLI reports sign-in problems on stdout, other failures on
        // stderr — consider both when explaining what went wrong.
        finish({ ok: false, error: failureMessage(code, `${errOut}\n${out}`) });
      }
    });
    child.stdin.on('error', () => {});
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

function startFailureMessage(detail) {
  return (
    'The AI could not be started on this machine' +
    (detail ? ` (${detail})` : '') +
    '. Papers will not invent a reply in its place.'
  );
}

function failureMessage(code, stderrText) {
  const detail = (stderrText || '').trim();
  if (/not logged in/i.test(detail)) {
    return (
      'The AI is not signed in on this machine yet. Open a terminal, run `claude` and sign in once with `/login`, then try again. ' +
      'Your room, things, and notes are unaffected — Papers keeps them itself.'
    );
  }
  return (
    'The AI failed to respond' +
    (detail ? ` (${detail.slice(0, 300)})` : ` (exit code ${code})`) +
    '. Papers will not invent a reply in its place.'
  );
}

module.exports = { id, label, complete };
