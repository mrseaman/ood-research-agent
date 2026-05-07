'use strict';

const fs = require('fs');
const path = require('path');

const HOME = process.env.HOME || '/tmp';

/**
 * Load and merge cluster configuration from system and user config files.
 *
 * System config: /etc/ood/config/apps/research-agent/cluster.json
 * User config:   ~/.research-agent/config/cluster.json
 *
 * User config is merged on top of system config (user can override or add software).
 */

const SYSTEM_CONFIG_PATH = '/etc/ood/config/apps/research-agent/cluster.json';
const USER_CONFIG_PATH = path.join(HOME, '.research-agent', 'config', 'cluster.json');

function loadJSON(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

let cachedConfig = null;

function loadClusterConfig() {
  if (cachedConfig) return cachedConfig;

  const systemConfig = loadJSON(SYSTEM_CONFIG_PATH) || {};
  const userConfig = loadJSON(USER_CONFIG_PATH) || {};

  // Merge: user software overrides/extends system software
  const merged = {
    software: { ...systemConfig.software, ...userConfig.software },
  };

  cachedConfig = merged;
  return merged;
}

/**
 * Build a prompt section describing available software.
 * Returns empty string if no software is configured.
 */
function getSoftwarePrompt() {
  const config = loadClusterConfig();
  const software = config.software;
  if (!software || Object.keys(software).length === 0) return '';

  const lines = [];
  for (const [name, info] of Object.entries(software)) {
    const parts = [`**${name}**`];

    if (info.versions && info.versions.length > 0) {
      const defaultVer = info.default || info.versions[0];
      const verStr = info.versions.map(v =>
        v === defaultVer ? `${v} (default)` : v
      ).join(', ');
      parts.push(`Versions: ${verStr}`);
      parts.push(`Module: \`module load ${name}/${defaultVer}\``);
    }

    if (info.path) {
      parts.push(`Path: ${info.path}`);
    }

    // Extra paths (e.g. pseudopotentials, basis sets)
    const skipKeys = new Set(['versions', 'default', 'path', 'notes']);
    for (const [key, val] of Object.entries(info)) {
      if (!skipKeys.has(key) && typeof val === 'string') {
        parts.push(`${key}: ${val}`);
      }
    }

    if (info.notes) {
      parts.push(`Notes: ${info.notes}`);
    }

    lines.push('- ' + parts.join(' | '));
  }

  return lines.join('\n');
}

module.exports = { loadClusterConfig, getSoftwarePrompt };
