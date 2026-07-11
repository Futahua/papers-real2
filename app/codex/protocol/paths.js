'use strict';

// Windows path comparison and workspace-boundary classification.
//
// Gate A showed the App Server reports its home in extended-length form
// (\\?\D:\...). A naive string compare against the requested home fails, so
// every home/boundary check must normalize first. This module is the single
// place that logic lives, and it is heavily tested.

const path = require('node:path');
const fs = require('node:fs');

// Normalize a Windows path for comparison:
//   1. strip a leading \\?\ (or //?/) extended-length prefix
//   2. apply Windows path normalization
//   3. strip trailing separators except on a bare drive root (D:\)
//   4. lower-case for case-insensitive comparison
// Returns null for empty input.
function normalizeWinPath(p) {
  if (!p || typeof p !== 'string') return null;
  let s = p.replace(/^[\\/]{2}\?[\\/]/, '');
  s = path.win32.normalize(s);
  if (!/^[A-Za-z]:\\$/.test(s)) s = s.replace(/[\\/]+$/, '');
  return s.toLowerCase();
}

// True when two paths refer to the same location after normalization.
function samePath(a, b) {
  const na = normalizeWinPath(a);
  const nb = normalizeWinPath(b);
  return na !== null && na === nb;
}

// Classify a target path relative to a workspace root.
// Returns 'inside' | 'outside' | 'unknown'.
//
// Textual prefix matching alone is unsafe (traversal, junctions), so we
// prefer real/canonical paths. When canonicalization is impossible we fail
// safe: 'unknown' (which callers treat as "outside, needs stronger approval").
function classifyBoundary(workspaceRoot, target) {
  if (!workspaceRoot || !target) return 'unknown';
  const root = canonical(workspaceRoot);
  const tgt = canonical(target);
  if (root === null || tgt === null) return 'unknown';
  const nr = normalizeWinPath(root);
  const nt = normalizeWinPath(tgt);
  if (nr === null || nt === null) return 'unknown';
  if (nt === nr) return 'inside';
  // Ensure a true path-segment boundary, not just a string prefix
  // (D:\ws vs D:\ws-other must not match).
  const prefix = nr.endsWith('\\') ? nr : nr + '\\';
  return nt.startsWith(prefix) ? 'inside' : 'outside';
}

// Resolve to a canonical real path when the path exists; otherwise resolve
// the deepest existing ancestor and re-append the tail, so a not-yet-created
// target still classifies correctly. Returns null if even that fails.
function canonical(p) {
  try {
    return fs.realpathSync.native(p);
  } catch {
    // Walk up to the nearest existing ancestor, canonicalize it, re-attach.
    try {
      const resolved = path.win32.resolve(p);
      let dir = resolved;
      const tail = [];
      // Bounded walk to avoid pathological loops.
      for (let i = 0; i < 64; i++) {
        const parent = path.win32.dirname(dir);
        if (parent === dir) return null; // reached root with nothing existing
        tail.unshift(path.win32.basename(dir));
        dir = parent;
        try {
          const real = fs.realpathSync.native(dir);
          return path.win32.join(real, ...tail);
        } catch {
          // keep walking up
        }
      }
      return null;
    } catch {
      return null;
    }
  }
}

module.exports = { normalizeWinPath, samePath, classifyBoundary, canonical };
