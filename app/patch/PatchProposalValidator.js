'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PATCH_CODE, PatchError } = require('./PatchErrors');

const DEVICE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
function fail(message, detail) { throw new PatchError(PATCH_CODE.INVALID, message, detail); }
function normalizePatchPath(raw) {
  if (typeof raw !== 'string' || !raw || raw.includes('\0')) fail('Patch path is malformed.');
  let p = raw.replace(/^([ab])\//, '').replace(/\\/g, '/');
  if (p === '/dev/null') fail('File deletion is not supported.');
  if (/^[a-zA-Z]:/.test(p) || p.startsWith('/') || p.startsWith('//')) throw new PatchError(PATCH_CODE.UNSAFE_PATH, 'Absolute, drive, and UNC paths are rejected.');
  const parts = p.split('/');
  if (parts.some((s) => !s || s === '..' || s === '.')) throw new PatchError(PATCH_CODE.UNSAFE_PATH, 'Traversal or empty path components are rejected.');
  if (parts.some((s) => s.toLowerCase() === '.git' || DEVICE.test(s) || s.includes(':'))) throw new PatchError(PATCH_CODE.UNSAFE_PATH, 'Git internals, device names, and alternate streams are rejected.');
  return parts.join('/');
}
function validateUnifiedDiff(rawDiff) {
  if (typeof rawDiff !== 'string' || !rawDiff.trim()) fail('Patch is empty.');
  if (rawDiff.includes('\0') || /GIT binary patch|Binary files .* differ/i.test(rawDiff)) fail('Binary patches are rejected.');
  // git apply treats a patch whose last line has no terminating newline as
  // corrupt; Papers must never validate what git would later reject.
  if (!/\r?\n$/.test(rawDiff)) fail('Patch must end with a trailing newline.');
  if (/^(old mode|new mode|deleted file mode|similarity index|rename from|rename to|copy from|copy to) /m.test(rawDiff) || /^new file mode (?!100644$)/m.test(rawDiff)) fail('Mode, rename, copy, and deletion metadata are rejected.');
  const lines = rawDiff.replace(/\r\n/g, '\n').split('\n');
  const sections = []; let current = null; let oldHeader = null;
  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      const m = /^diff --git a\/(\S+) b\/(\S+)$/.exec(line); if (!m) fail('Unexpected diff header.');
      if (m[1] !== m[2]) fail('Rename or copy patches are rejected.');
      current = { path: normalizePatchPath(m[1]), hunks: 0 }; sections.push(current); oldHeader = null; continue;
    }
    if (line.startsWith('--- ')) { if (!current) fail('Old-file header without diff section.'); const old=line.slice(4).split('\t')[0]; oldHeader=old==='/dev/null'?'/dev/null':normalizePatchPath(old); current.newFile=oldHeader==='/dev/null'; continue; }
    if (line.startsWith('+++ ')) {
      if (!current || !oldHeader) fail('New-file header is malformed.');
      const next = line.slice(4).split('\t')[0];
      if (next === '/dev/null') fail('File deletion is not supported.');
      const np = normalizePatchPath(next); if (np !== current.path || (!current.newFile && oldHeader !== current.path)) fail('Header paths do not match.'); continue;
    }
    if (line.startsWith('@@ ')) { if (!current || !oldHeader || !/^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/.test(line)) fail('Malformed unified-diff hunk.'); current.hunks++; continue; }
    if (/^(index [0-9a-f]+\.\.[0-9a-f]+(?: 100644)?|new file mode 100644|\\ No newline at end of file)$/.test(line) || line === '') continue;
    if (/^[ +\-]/.test(line)) { if (!current || current.hunks === 0) fail('Patch content appears outside a hunk.'); continue; }
    fail('Unexpected patch header or content.', { prefix: line.slice(0, 24) });
  }
  if (!sections.length || sections.some((s) => !s.hunks)) fail('Patch has no complete textual file sections.');
  const paths = sections.map((s) => s.path); if (new Set(paths).size !== paths.length) fail('Duplicate conflicting file sections are rejected.');
  return { rawDiff: rawDiff.replace(/\r\n/g, '\n'), affectedPaths: paths };
}
function assertExistingChainSafe(root, relativePath) {
  const rootStat=fs.lstatSync(root);if(rootStat.isSymbolicLink()||isWindowsReparse(root))throw new PatchError(PATCH_CODE.UNSAFE_PATH,'The worktree root cannot be a symbolic link or reparse point.');
  const canonicalRoot = fs.realpathSync.native(root); let cursor = canonicalRoot;
  for (const part of relativePath.split('/').slice(0, -1)) {
    cursor = path.join(cursor, part); if (!fs.existsSync(cursor)) break;
    const stat = fs.lstatSync(cursor);
    if (stat.isSymbolicLink()||isWindowsReparse(cursor)) throw new PatchError(PATCH_CODE.UNSAFE_PATH, 'Symbolic links, junctions, mount points, and reparse points are rejected.', { path: relativePath });
    const real = fs.realpathSync.native(cursor);
    const expected = path.resolve(cursor);
    if (path.normalize(real).toLowerCase() !== path.normalize(expected).toLowerCase()) throw new PatchError(PATCH_CODE.UNSAFE_PATH, 'Existing path component escapes through a reparse point.', { path: relativePath });
  }
  const target = path.resolve(canonicalRoot, relativePath);
  const prefix = canonicalRoot.endsWith(path.sep) ? canonicalRoot : canonicalRoot + path.sep;
  if (target !== canonicalRoot && !target.toLowerCase().startsWith(prefix.toLowerCase())) throw new PatchError(PATCH_CODE.UNSAFE_PATH, 'Patch target escapes the worktree.');
  if (fs.existsSync(target)) {
    const stat = fs.lstatSync(target);
    if (!stat.isFile() || stat.isSymbolicLink() || isWindowsReparse(target)) throw new PatchError(PATCH_CODE.UNSAFE_PATH, 'Only non-reparse regular files are supported.', { path: relativePath });
  }
  return target;
}
function isWindowsReparse(candidate){if(process.platform!=='win32')return false;const r=spawnSync('fsutil.exe',['reparsepoint','query',candidate],{encoding:'utf8',shell:false,windowsHide:true});if(r.error)throw new PatchError(PATCH_CODE.UNSAFE_PATH,'Windows reparse-point inspection failed closed.');return r.status===0;}
module.exports = { validateUnifiedDiff, normalizePatchPath, assertExistingChainSafe };
