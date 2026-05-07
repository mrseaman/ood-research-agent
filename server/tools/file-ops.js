'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const config = require('../config');

function resolvePath(p) {
  if (p.startsWith('~')) {
    p = path.join(os.homedir(), p.slice(1));
  }
  return path.resolve(os.homedir(), p);
}

function validatePath(p) {
  const resolved = resolvePath(p);
  const allowed = config.allowedPaths.some(ap => resolved.startsWith(ap));
  if (!allowed) {
    throw new Error(`Path not allowed: ${resolved}. Allowed paths: ${config.allowedPaths.join(', ')}`);
  }
  // block sensitive files
  const basename = path.basename(resolved);
  const sensitive = ['.ssh', '.gnupg', '.env', '.bashrc', '.bash_profile', '.profile'];
  if (sensitive.includes(basename) && path.dirname(resolved) === os.homedir()) {
    throw new Error(`Access to sensitive file denied: ${basename}`);
  }
  return resolved;
}

async function readFile({ path: filePath }) {
  const resolved = validatePath(filePath);
  const stat = fs.statSync(resolved);
  if (stat.size > config.maxFileSize) {
    return `Error: File too large (${stat.size} bytes). Max allowed: ${config.maxFileSize} bytes. Use head/tail via run_command to read portions.`;
  }
  return fs.readFileSync(resolved, 'utf8');
}

async function writeFile({ path: filePath, content }) {
  const resolved = validatePath(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, content, 'utf8');
  return `File written successfully: ${resolved} (${Buffer.byteLength(content)} bytes)`;
}

async function listFiles({ directory, pattern }) {
  const resolved = validatePath(directory || '~');
  const entries = fs.readdirSync(resolved, { withFileTypes: true });

  let results = entries.map(e => ({
    name: e.name,
    type: e.isDirectory() ? 'directory' : 'file',
    path: path.join(resolved, e.name),
  }));

  if (pattern) {
    const regex = new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'));
    results = results.filter(r => regex.test(r.name));
  }

  return results.map(r => `${r.type === 'directory' ? '[DIR]' : '[FILE]'} ${r.name}`).join('\n') || '(empty directory)';
}

module.exports = { readFile, writeFile, listFiles, resolvePath, validatePath };
