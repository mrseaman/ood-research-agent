'use strict';

const { execFile, exec } = require('child_process');

const HOME = process.env.HOME || '/';

/**
 * Tier 1: Safe commands that run directly via execFile (no shell).
 * These need no user confirmation.
 */
const ALLOWED_COMMANDS = new Set([
  // File inspection
  'ls', 'cat', 'head', 'tail', 'wc', 'file', 'stat', 'du', 'diff',
  // Search
  'grep', 'find', 'which', 'whereis', 'locate',
  // File operations
  'mkdir', 'cp', 'mv', 'rm', 'touch', 'ln', 'chmod', 'chown',
  // Text processing
  'sort', 'uniq', 'cut', 'tr', 'sed', 'awk',
  // Archive
  'tar', 'gzip', 'gunzip', 'zip', 'unzip',
  // System info
  'pwd', 'whoami', 'hostname', 'date', 'df', 'free', 'uname', 'env', 'printenv',
  // HPC / cluster
  'module', 'squeue', 'qstat', 'sacct', 'sinfo', 'sbatch', 'scancel', 'scontrol',
  // Network
  'curl', 'wget', 'ping', 'ssh', 'scp', 'rsync',
  // Process
  'ps', 'top', 'htop', 'kill',
  // Python / tools
  'python', 'python3', 'pip', 'pip3', 'conda', 'mamba',
]);

/**
 * Tier 2: Dangerous commands that are always blocked, even with user confirmation.
 */
const BLOCKED_PATTERNS = [
  /\brm\s+(-rf?|--recursive)\s+[\/~]/, // rm -rf / or ~
  /\bmkfs\b/,
  /\bdd\b.*\bof=\/dev\//,
  /\bshutdown\b/,
  /\breboot\b/,
  /\b:(){ :|:& };:/,  // fork bomb
];

function parseCommand(commandStr) {
  const tokens = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < commandStr.length; i++) {
    const ch = commandStr[i];
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
    } else if (ch === ' ' && !inSingle && !inDouble) {
      if (current) tokens.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current) tokens.push(current);
  return tokens;
}

/**
 * Check if a command string contains shell operators.
 */
function hasShellOperators(command) {
  // Check outside of quotes
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (ch === "'" && !inDouble) { inSingle = !inSingle; continue; }
    if (ch === '"' && !inSingle) { inDouble = !inDouble; continue; }
    if (!inSingle && !inDouble) {
      if (ch === '|' || ch === '&' || ch === ';' || ch === '>' || ch === '<'
          || ch === '`' || ch === '$' || ch === '(' || ch === ')') {
        return true;
      }
    }
  }
  return false;
}

/**
 * Extract all command names from a shell command string
 * (handles pipes, &&, ||, ;)
 */
function extractCommands(command) {
  // Split on shell operators outside quotes
  const parts = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (ch === "'" && !inDouble) { inSingle = !inSingle; current += ch; continue; }
    if (ch === '"' && !inSingle) { inDouble = !inDouble; current += ch; continue; }
    if (!inSingle && !inDouble && (ch === '|' || ch === '&' || ch === ';')) {
      if (current.trim()) parts.push(current.trim());
      current = '';
      // Skip && or ||
      if (i + 1 < command.length && (command[i + 1] === '&' || command[i + 1] === '|')) i++;
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());

  return parts.map(p => {
    const tokens = parseCommand(p);
    return tokens[0] || '';
  }).filter(Boolean);
}

/**
 * Tier 1: run_command — safe commands, no confirmation needed.
 */
async function runCommand({ command }) {
  const trimmed = command.trim();

  // If it has shell operators, reject and suggest run_shell
  if (hasShellOperators(trimmed)) {
    throw new Error(
      'This command contains shell operators (|, &&, >, etc.). '
      + 'Use the run_shell tool instead, which supports full shell syntax but requires user confirmation.'
    );
  }

  const tokens = parseCommand(trimmed);
  if (tokens.length === 0) {
    throw new Error('Empty command');
  }

  const cmd = tokens[0];
  const args = tokens.slice(1);

  if (!ALLOWED_COMMANDS.has(cmd)) {
    throw new Error(`Command not allowed: "${cmd}". Use run_shell for arbitrary commands (requires user confirmation).`);
  }

  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 30000, maxBuffer: 1024 * 512, cwd: HOME }, (err, stdout, stderr) => {
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

/**
 * Tier 2: run_shell — full shell commands, requires user confirmation.
 * Returns { needsConfirmation: true, command } if not yet confirmed.
 * The agent loop handles the confirmation flow.
 */
async function runShell({ command, confirmed }) {
  const trimmed = command.trim();

  // Check blocked patterns
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(trimmed)) {
      throw new Error('This command is blocked for safety reasons.');
    }
  }

  // If not confirmed, return a confirmation request
  if (!confirmed) {
    return { needsConfirmation: true, command: trimmed };
  }

  // Execute through bash
  return new Promise((resolve, reject) => {
    exec(trimmed, {
      timeout: 60000,
      maxBuffer: 1024 * 512,
      cwd: HOME,
      shell: '/bin/bash',
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

module.exports = { runCommand, runShell };
