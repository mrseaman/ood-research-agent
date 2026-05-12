'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const CONFIG_DIR = path.join(os.homedir(), '.research-agent', 'config');
const MODELS_PATH = path.join(CONFIG_DIR, 'models.json');

const ID_PREFIX = 'user:';
const ID_RE = /^[a-zA-Z0-9_.-]+$/;

function ensureDir() {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
}

function readRaw() {
  try {
    const buf = fs.readFileSync(MODELS_PATH, 'utf8');
    const data = JSON.parse(buf);
    if (data && Array.isArray(data.models)) return data.models;
  } catch {}
  return [];
}

function writeRaw(models) {
  ensureDir();
  const tmp = MODELS_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ models }, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, MODELS_PATH);
}

function normalizeId(rawId, name) {
  let base = (rawId || name || '').trim();
  if (base.startsWith(ID_PREFIX)) base = base.slice(ID_PREFIX.length);
  base = base.replace(/[^a-zA-Z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!base) base = 'model';
  return ID_PREFIX + base;
}

function loadModels() {
  return readRaw().filter(m => m && m.endpoint && m.model && typeof m.id === 'string' && m.id.startsWith(ID_PREFIX));
}

function listForApi() {
  // Token masked for safe display in the UI.
  return loadModels().map(m => ({
    id: m.id,
    name: m.name || m.id,
    endpoint: m.endpoint,
    model: m.model,
    useProxy: !!m.useProxy,
    hasToken: !!m.token,
  }));
}

function upsert(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('Invalid model payload');
  }
  const name = String(input.name || '').trim();
  const endpoint = String(input.endpoint || '').trim();
  const model = String(input.model || '').trim();
  if (!name) throw new Error('Missing name');
  if (!/^https?:\/\//i.test(endpoint)) throw new Error('Endpoint must start with http:// or https://');
  if (!model) throw new Error('Missing model');

  const id = normalizeId(input.id, name);
  if (!ID_RE.test(id.slice(ID_PREFIX.length))) {
    throw new Error('Invalid id (use letters, digits, dot, underscore, hyphen)');
  }

  const existing = loadModels();
  const idx = existing.findIndex(m => m.id === id);
  const prev = idx >= 0 ? existing[idx] : null;
  const tokenInput = typeof input.token === 'string' ? input.token : '';
  // If the client sends an empty token AND we already have one, keep the previous value.
  const token = tokenInput || (prev ? prev.token : '');

  const record = {
    id,
    name,
    endpoint,
    model,
    token,
    useProxy: !!input.useProxy,
  };

  const next = idx >= 0
    ? [...existing.slice(0, idx), record, ...existing.slice(idx + 1)]
    : [...existing, record];
  writeRaw(next);
  return { id, name, endpoint, model, useProxy: record.useProxy, hasToken: !!record.token };
}

function remove(id) {
  if (typeof id !== 'string' || !id.startsWith(ID_PREFIX)) {
    throw new Error('Not a user model id');
  }
  const existing = loadModels();
  const next = existing.filter(m => m.id !== id);
  if (next.length === existing.length) return false;
  writeRaw(next);
  return true;
}

function getModelById(id) {
  if (typeof id !== 'string' || !id.startsWith(ID_PREFIX)) return null;
  return loadModels().find(m => m.id === id) || null;
}

module.exports = {
  ID_PREFIX,
  loadModels,
  listForApi,
  upsert,
  remove,
  getModelById,
};
