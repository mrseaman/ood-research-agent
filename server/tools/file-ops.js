'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const config = require('../config');

function resolvePath(p) {
  if (typeof p !== 'string' || !p.trim()) {
    throw new Error('Missing required argument: path');
  }
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
    return `Error: File too large (${stat.size} bytes). Max allowed: ${config.maxFileSize} bytes. Use head/tail via run_shell to read portions.`;
  }
  return fs.readFileSync(resolved, 'utf8');
}

async function writeFile({ path: filePath, content }) {
  if (typeof content !== 'string') {
    throw new Error('Missing required argument: content (must be a string)');
  }
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

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp']);
const MIME_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
};

async function displayImage({ path: filePath, caption }) {
  const resolved = validatePath(filePath);
  const ext = path.extname(resolved).toLowerCase();
  if (!IMAGE_EXTS.has(ext)) {
    throw new Error(`Not a supported image format (${ext}). Supported: ${[...IMAGE_EXTS].join(', ')}`);
  }
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) {
    throw new Error(`Not a file: ${resolved}`);
  }
  const kb = Math.round(stat.size / 1024);
  const captionStr = caption ? ` — ${caption}` : '';
  return `Image displayed: ${resolved} (${kb} KB)${captionStr}`;
}

module.exports = { readFile, writeFile, listFiles, displayImage, resolvePath, validatePath, IMAGE_EXTS, MIME_BY_EXT };
