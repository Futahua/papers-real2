'use strict';

// Resolves the one native Codex executable Papers is allowed to spawn.
//
// Papers spawns with shell:false, which cannot safely launch the npm `codex`
// / `codex.cmd` shims that are usually all that PATH exposes on Windows. The
// real binary ships vendored inside the npm package the shim points at. This
// resolver finds a native executable deterministically:
//   1. PAPERS_CODEX_EXE, when it names an existing regular native executable;
//   2. a native codex.exe (codex on POSIX) directly on PATH;
//   3. the vendored codex.exe next to an npm shim found on PATH.
// Anything else is a specific CODEX_EXECUTABLE_NOT_FOUND failure — never a
// generic one — and the message stays free of machine-private paths.

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { CodexError, CODE } = require('./CodexErrors');

// Vendored-binary layouts observed for @openai/codex npm installs, relative
// to the directory holding the PATH shim. npm may nest or hoist the platform
// package, so both shapes are checked.
const VENDOR_ROOTS = [
  ['node_modules', '@openai', 'codex', 'node_modules'],
  ['node_modules'],
];

function resolveCodexExecutable(opts = {}) {
  const env = opts.env || process.env;
  const platform = opts.platform || process.platform;
  const io = opts.io || fs;
  const runWhere = opts.runWhere || ((name) => defaultWhere(name, platform));
  const win = platform === 'win32';
  const isNative = (p) => !win || /\.exe$/i.test(p);
  const isRegularFile = (p) => { try { return io.statSync(p).isFile(); } catch { return false; } };

  const override = env.PAPERS_CODEX_EXE;
  if (override && isNative(override) && isRegularFile(override)) {
    return { path: path.resolve(override), source: 'env-override' };
  }

  for (const found of runWhere(win ? 'codex.exe' : 'codex')) {
    if (isNative(found) && isRegularFile(found)) return { path: found, source: 'path-native' };
  }

  if (win) {
    // Only shims are on PATH; derive the vendored native binary they wrap.
    for (const shim of runWhere('codex')) {
      const shimDir = path.dirname(shim);
      for (const root of VENDOR_ROOTS) {
        const scoped = path.join(shimDir, ...root, '@openai');
        let entries = [];
        try { entries = io.readdirSync(scoped); } catch { continue; }
        for (const entry of entries) {
          if (!/^codex-win32-/.test(entry)) continue;
          const vendor = path.join(scoped, entry, 'vendor');
          let targets = [];
          try { targets = io.readdirSync(vendor); } catch { continue; }
          for (const target of targets) {
            const exe = path.join(vendor, target, 'codex', 'codex.exe');
            if (isRegularFile(exe)) return { path: exe, source: 'npm-shim-vendor' };
          }
        }
      }
    }
  }

  throw new CodexError(CODE.CODEX_EXECUTABLE_NOT_FOUND,
    'The native Codex executable was not found. Install the Codex CLI, or set PAPERS_CODEX_EXE to the full path of the native codex executable.',
    win ? { hint: 'codex.cmd shims cannot be launched safely; a native codex.exe is required' } : null);
}

function defaultWhere(name, platform) {
  const finder = platform === 'win32' ? 'where.exe' : 'which';
  const r = spawnSync(finder, [name], { encoding: 'utf8', shell: false, windowsHide: true });
  if (r.error || r.status !== 0) return [];
  return String(r.stdout || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

module.exports = { resolveCodexExecutable };
