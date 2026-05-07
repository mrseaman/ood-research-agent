'use strict';

const fs = require('fs');
const path = require('path');

/**
 * In-memory store for pending tool confirmations.
 * When a tool needs user approval, it creates a pending confirmation.
 * The frontend sends POST /api/confirm/:id to approve or deny.
 * The agent loop awaits the result.
 */

const LOG_FILE = path.join(process.env.HOME || '/tmp', '.research-agent', 'agent-debug.log');
function debugLog(msg) {
  try {
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
}

const pending = new Map();
const TIMEOUT = 120000; // 2 minutes

const confirmations = {
  /**
   * Create a pending confirmation and return a promise that resolves
   * with true (approved) or false (denied/timeout).
   */
  create(id) {
    debugLog(`[confirmations] create(${id}) — waiting for user response`);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        debugLog(`[confirmations] TIMEOUT for id=${id}`);
        pending.delete(id);
        resolve(false);
      }, TIMEOUT);

      pending.set(id, { resolve, timer });
    });
  },

  /**
   * Resolve a pending confirmation.
   * Returns true if the confirmation existed, false otherwise.
   */
  resolve(id, approved) {
    debugLog(`[confirmations] resolve(${id}, ${approved}) — pending has id: ${pending.has(id)}`);
    const entry = pending.get(id);
    if (!entry) return false;
    clearTimeout(entry.timer);
    pending.delete(id);
    entry.resolve(approved);
    return true;
  },
};

module.exports = { confirmations };
