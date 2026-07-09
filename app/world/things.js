'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { newId } = require('./ids');

// A thing reference points at something real on the creator's machine.
// Papers stores metadata about the real item; the item itself stays where it
// lives. A reference must never be presented as if Papers owned the original.

const MAX_TEXT_BYTES = 24 * 1024;
const MAX_FOLDER_ENTRIES = 200;

function createThingReference(realPath) {
  const resolved = path.resolve(realPath);
  const now = new Date().toISOString();
  let type = 'unknown';
  let status = 'unknown';
  try {
    const stat = fs.statSync(resolved);
    type = stat.isDirectory() ? 'folder' : 'file';
    status = 'present';
  } catch {
    status = 'missing';
  }
  return {
    id: newId('thing'),
    path: resolved,
    displayName: path.basename(resolved) || resolved,
    type,
    origin: 'external',
    attachedAt: now,
    lastCheckedAt: now,
    status,
  };
}

// Re-verify a reference against reality. Returns an updated copy; never
// guesses. If the real item is gone, the status says so.
function checkThing(thing) {
  const now = new Date().toISOString();
  try {
    const stat = fs.statSync(thing.path);
    return {
      ...thing,
      type: stat.isDirectory() ? 'folder' : 'file',
      status: 'present',
      lastCheckedAt: now,
    };
  } catch {
    return { ...thing, status: 'missing', lastCheckedAt: now };
  }
}

// Read what a thing actually contains right now, for showing to the AI.
// Truthful by construction: reports byte counts, truncation, unreadable and
// binary content honestly instead of papering over them.
function readThingContent(thing) {
  try {
    const stat = fs.statSync(thing.path);
    if (stat.isDirectory()) {
      const names = fs.readdirSync(thing.path);
      const shown = names.slice(0, MAX_FOLDER_ENTRIES);
      const lines = shown.map((name) => {
        try {
          const s = fs.statSync(path.join(thing.path, name));
          return s.isDirectory() ? `${name}/` : `${name} (${s.size} bytes)`;
        } catch {
          return `${name} (unreadable)`;
        }
      });
      let listing = lines.join('\n');
      if (names.length > shown.length) {
        listing += `\n… and ${names.length - shown.length} more entries not listed.`;
      }
      return {
        ok: true,
        kind: 'folder-listing',
        totalEntries: names.length,
        shownEntries: shown.length,
        text: listing,
      };
    }
    const size = stat.size;
    const fd = fs.openSync(thing.path, 'r');
    const buf = Buffer.alloc(Math.min(size, MAX_TEXT_BYTES));
    fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    if (buf.includes(0)) {
      return {
        ok: true,
        kind: 'binary',
        totalBytes: size,
        shownBytes: 0,
        text: `(binary file, ${size} bytes — content not included)`,
      };
    }
    let text = buf.toString('utf8');
    const truncated = size > MAX_TEXT_BYTES;
    if (truncated) {
      text += `\n… (truncated: showing first ${MAX_TEXT_BYTES} of ${size} bytes)`;
    }
    return {
      ok: true,
      kind: 'text',
      totalBytes: size,
      shownBytes: buf.length,
      truncated,
      text,
    };
  } catch (err) {
    return {
      ok: false,
      kind: 'unreadable',
      text: `(could not read: ${err.code || err.message})`,
    };
  }
}

module.exports = {
  createThingReference,
  checkThing,
  readThingContent,
  MAX_TEXT_BYTES,
  MAX_FOLDER_ENTRIES,
};
