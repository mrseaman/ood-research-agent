'use strict';

const { execFile, execFileSync } = require('child_process');

const HOME = process.env.HOME || '/';

// Capture the user's interactive-shell environment once at startup. Passenger
// inherits a stripped PATH (only /opt/ood/.../bin + /usr/bin etc.), so a login
// shell is needed to pick up ~/.bashrc, module system, conda init, etc.
let USER_ENV = process.env;
try {
  const out = execFileSync('/bin/bash', ['-lc', 'env -0'], {
    timeout: 5000,
    maxBuffer: 1024 * 1024,
    encoding: 'utf8',
  });
  const userEnv = {};
  for (const entry of out.split('\0')) {
    if (!entry) continue;
    const eq = entry.indexOf('=');
    if (eq <= 0) continue;
    userEnv[entry.slice(0, eq)] = entry.slice(eq + 1);
  }
  USER_ENV = { ...process.env, ...userEnv };
} catch (err) {
  console.warn('Could not capture login-shell env:', err.message);
}

// Hard denylist — never executed even after user approval.
const BLOCKED_PATTERNS = [
  /\brm\s+(-rf?|--recursive)\s+[\/~]/, // rm -rf / or ~
  /\bmkfs\b/,
  /\bdd\b.*\bof=\/dev\//,
  /\bshutdown\b/,
  /\breboot\b/,
  /\b:(){ :|:& };:/,  // fork bomb
];

// Read-only / inspection commands that run without prompting the user.
// Edit this list to extend the defaults, or add more via the
// RA_SHELL_AUTO_APPROVE env var (comma-separated, e.g. "git,npm,make").
// Auto-approval only applies to plain commands (no |, >, &&, ;, $(...), `).
const DEFAULT_AUTO_APPROVE = [
  // File inspection
  'ls', 'cat', 'head', 'tail', 'wc', 'file', 'stat', 'du', 'diff',
  // Search
  'grep', 'find', 'which', 'whereis', 'locate',
  // System info
  'pwd', 'whoami', 'hostname', 'date', 'df', 'free', 'uname', 'env', 'printenv', 'id', 'uptime',
  // HPC / cluster (read-only)
  'module', 'squeue', 'qstat', 'sacct', 'sinfo', 'scontrol',
  // Process inspection
  'ps', 'top',
  // Version / help
  'python', 'python3', 'pip', 'pip3', 'conda', 'mamba', 'node', 'npm', 'git',
];

const AUTO_APPROVE = new Set([
  ...DEFAULT_AUTO_APPROVE,
  ...(process.env.RA_SHELL_AUTO_APPROVE || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),
]);

// Any of these outside of single/double quotes disqualifies auto-approval —
// pipelines and substitutions can chain into arbitrary commands.
const SHELL_OP_RE = /(^|[^\\])([|&;><`]|\$\()/;

function firstToken(cmd) {
  // Strip a leading sudo if present; we still don't auto-approve sudo though.
  const m = cmd.match(/^\s*([^\s]+)/);
  return m ? m[1] : '';
}

function isAutoApprovable(cmd) {
  if (SHELL_OP_RE.test(cmd)) return false;
  const first = firstToken(cmd);
  if (!first || first === 'sudo') return false;
  return AUTO_APPROVE.has(first);
}

/**
 * run_shell — run an arbitrary command through a login bash shell.
 * Supports pipes, redirection, command substitution, modules, conda, etc.
 * Returns { needsConfirmation: true, command } if confirmation is required;
 * the agent loop relays the confirm event to the client.
 */
async function runShell({ command, confirmed }) {
  const trimmed = command.trim();

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(trimmed)) {
      throw new Error('This command is blocked for safety reasons.');
    }
  }

  if (!confirmed && !isAutoApprovable(trimmed)) {
    return { needsConfirmation: true, command: trimmed };
  }

  return new Promise((resolve, reject) => {
    execFile('/bin/bash', ['-lc', trimmed], {
      timeout: 60000,
      maxBuffer: 1024 * 512,
      cwd: HOME,
      env: USER_ENV,
    }, (err, stdout, stderr) => {
      if (err) {
        if (stdout || stderr) {
          resolve(`Exit code: ${err.code || 1}\nstdout: ${stdout}\nstderr: ${stderr}`);
        } else {
          reject(new Error(`Command failed: ${err.message}`));
        }
      } else {
        resolve(stdout || '(no output)');
      }
    });
  });
}

module.exports = { runShell };
