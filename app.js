'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const express = require('express');
const hbs = require('hbs');
const dotenv = require('dotenv');
const Tokens = require('csrf');

// Load environment variables (order: .env.local, /etc/ood/config, .env)
['.env.local', '/etc/ood/config/apps/research-agent/env', '.env'].forEach(f => {
  const p = path.isAbsolute(f) ? f : path.join(__dirname, f);
  if (fs.existsSync(p)) {
    dotenv.config({ path: p });
  }
});

const { runAgentLoop } = require('./server/agent-loop');
const { confirmations } = require('./server/confirmations');
const sessions = require('./server/sessions');
const config = require('./server/config');
const { validatePath, IMAGE_EXTS, MIME_BY_EXT } = require('./server/tools/file-ops');
const { runShell } = require('./server/tools/command-ops');
const userModels = require('./server/user-models');

// CSRF setup — persist secret across Passenger restarts so issued tokens stay valid
const tokens = new Tokens({});
const SECRET_PATH = path.join(os.homedir(), '.research-agent', 'csrf-secret');
function loadOrCreateSecret() {
  try {
    return fs.readFileSync(SECRET_PATH, 'utf8').trim();
  } catch {}
  const s = tokens.secretSync();
  try {
    fs.mkdirSync(path.dirname(SECRET_PATH), { recursive: true });
    fs.writeFileSync(SECRET_PATH, s, { mode: 0o600 });
  } catch (err) {
    console.warn('Could not persist CSRF secret:', err.message);
  }
  return s;
}
const secret = loadOrCreateSecret();

const app = express();
const router = express.Router();

app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));

// Body parsing
router.use(express.json({ limit: '1mb' }));

// CSRF verification middleware for mutating routes
function csrfProtect(req, res, next) {
  const token = req.headers['x-csrf-token'];
  if (!token || !tokens.verify(secret, token)) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }
  next();
}

// --- Views ---

router.get('/', (req, res) => {
  res.render('index', {
    baseURI: req.baseUrl,
    csrfToken: tokens.create(secret),
    siteTitle: process.env.OOD_DASHBOARD_TITLE || 'Open OnDemand',
    branding: JSON.stringify(config.branding),
  });
});

// Fresh CSRF token (used by client retry-on-403 path)
router.get('/api/csrf', (req, res) => {
  res.json({ csrfToken: tokens.create(secret) });
});

// --- Models API ---

router.get('/api/models', (req, res) => {
  const adminModels = config.models.map(m => ({ id: m.id, name: m.name, source: 'admin' }));
  const user = userModels.listForApi().map(m => ({ id: m.id, name: m.name, source: 'user' }));
  res.json({ models: [...adminModels, ...user], default: config.defaultModelId });
});

// --- User model config API ---

router.get('/api/user-models', (req, res) => {
  res.json({ models: userModels.listForApi() });
});

router.post('/api/user-models', csrfProtect, (req, res) => {
  try {
    const saved = userModels.upsert(req.body || {});
    res.json({ ok: true, model: saved });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/api/user-models/:id', csrfProtect, (req, res) => {
  try {
    const removed = userModels.remove(req.params.id);
    if (!removed) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- Chat API ---

router.post('/api/chat', csrfProtect, (req, res) => {
  const { messages, sessionId, modelId, thinking, webSearch } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' });
  }

  // Set up SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // disable nginx buffering
  });

  // Handle client disconnect
  let closed = false;
  req.on('close', () => { closed = true; });

  runAgentLoop(res, messages, modelId, {
    thinking: thinking !== undefined ? !!thinking : undefined,
    webSearch: webSearch !== undefined ? !!webSearch : false,
  }).catch(err => {
    if (!closed) {
      res.write(`event: error\ndata: ${JSON.stringify({ text: err.message })}\n\n`);
    }
  }).finally(() => {
    if (!closed) {
      res.end();
    }
  });
});

// Direct shell execution for the user's "!" bash mode. User-typed, so
// confirmed:true is passed straight through; BLOCKED_PATTERNS still applies.
router.post('/api/run-shell', csrfProtect, async (req, res) => {
  const { command } = req.body || {};
  if (typeof command !== 'string' || !command.trim()) {
    return res.status(400).json({ error: 'Missing command' });
  }
  try {
    const result = await runShell({ command, confirmed: true });
    res.json({ output: typeof result === 'string' ? result : JSON.stringify(result) });
  } catch (err) {
    res.status(200).json({ output: `Error: ${err.message}`, error: true });
  }
});

// --- Tool Confirmation API ---

router.post('/api/confirm/:id', csrfProtect, (req, res) => {
  const { approved } = req.body;
  const resolved = confirmations.resolve(req.params.id, !!approved);
  if (!resolved) {
    return res.status(404).json({ error: 'Confirmation not found or expired' });
  }
  res.json({ ok: true });
});

// --- Session API ---

router.get('/api/sessions', (req, res) => {
  res.json(sessions.listSessions());
});

router.get('/api/sessions/:id', (req, res) => {
  const session = sessions.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json(session);
});

router.post('/api/sessions', csrfProtect, (req, res) => {
  const session = req.body;
  if (!session.id) {
    return res.status(400).json({ error: 'Session id required' });
  }
  res.json(sessions.saveSession(session));
});

router.delete('/api/sessions/:id', csrfProtect, (req, res) => {
  sessions.deleteSession(req.params.id);
  res.json({ ok: true });
});

// Serve image files referenced by display_image — same validatePath rules
router.get('/api/image', (req, res) => {
  const imgPath = req.query.path;
  if (!imgPath) return res.status(400).json({ error: 'Missing path' });
  try {
    const resolved = validatePath(imgPath);
    const ext = path.extname(resolved).toLowerCase();
    if (!IMAGE_EXTS.has(ext)) {
      return res.status(400).json({ error: 'Not an image file' });
    }
    const mime = MIME_BY_EXT[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'private, max-age=300');
    fs.createReadStream(resolved).pipe(res);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- File browsing API ---

router.get('/api/files', (req, res) => {
  const dirPath = req.query.path || '~';
  try {
    const resolved = validatePath(dirPath);
    const entries = require('fs').readdirSync(resolved, { withFileTypes: true });
    const result = entries.map(e => ({
      name: e.name,
      type: e.isDirectory() ? 'directory' : 'file',
      path: path.join(resolved, e.name),
    })).sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    res.json({ path: resolved, entries: result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- Static files ---

router.use(express.static(path.join(__dirname, 'public')));

// Mount at Passenger base URI or root
app.use(process.env.PASSENGER_BASE_URI || '/', router);

// Start server (Passenger or standalone)
const port = process.env.PORT || 3000;
const server = http.createServer(app);
server.listen(port, () => {
  console.log(`Research Agent listening on port ${port}`);
});
