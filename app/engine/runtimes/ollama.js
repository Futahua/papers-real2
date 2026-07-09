'use strict';

// Runtime backend: a local Ollama server. One implementation of the Papers
// engine contract — everything Ollama-specific stays in this file.
//
// Dev-level configuration only (no product surface):
//   PAPERS_ENGINE_URL    default http://127.0.0.1:11434
//   PAPERS_ENGINE_MODEL  default: the first model the server reports

const TIMEOUT_MS = 300000; // local models can be slow to load into memory

const id = 'ollama';

function baseUrl() {
  return (process.env.PAPERS_ENGINE_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
}

async function resolveModel() {
  const configured = (process.env.PAPERS_ENGINE_MODEL || '').trim();
  if (configured) return { ok: true, model: configured };
  let data;
  try {
    const res = await fetch(`${baseUrl()}/api/tags`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    return { ok: false, error: unreachableMessage(err) };
  }
  const models = (data.models || []).map((m) => m.name);
  if (!models.length) {
    return {
      ok: false,
      error: `The local AI runtime at ${baseUrl()} has no models installed. Install one (e.g. \`ollama pull <model>\`) or set PAPERS_ENGINE_MODEL. Papers will not invent a reply in its place.`,
    };
  }
  return { ok: true, model: models[0] };
}

function label() {
  const model = (process.env.PAPERS_ENGINE_MODEL || '').trim();
  return model ? `ollama (${model})` : 'ollama';
}

async function complete(prompt) {
  const resolved = await resolveModel();
  if (!resolved.ok) return { ok: false, error: resolved.error };
  let res;
  try {
    res = await fetch(`${baseUrl()}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: resolved.model, prompt, stream: false }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    return { ok: false, error: unreachableMessage(err) };
  }
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.text()).slice(0, 300); } catch {}
    return {
      ok: false,
      error: `The local AI runtime failed to respond (HTTP ${res.status}${detail ? `: ${detail}` : ''}). Papers will not invent a reply in its place.`,
    };
  }
  let data;
  try {
    data = await res.json();
  } catch {
    return { ok: false, error: 'The local AI runtime returned an unreadable response. Papers will not invent a reply in its place.' };
  }
  const text = (data.response || '').trim();
  if (!text) {
    return { ok: false, error: 'The local AI runtime returned an empty reply. Papers will not invent a reply in its place.' };
  }
  return { ok: true, text, model: resolved.model };
}

function unreachableMessage(err) {
  const detail = err && err.name === 'TimeoutError' ? 'timed out' : err?.message || 'unreachable';
  return `The local AI runtime could not be reached at ${baseUrl()} (${detail}). Papers will not invent a reply in its place.`;
}

module.exports = { id, label, complete };
