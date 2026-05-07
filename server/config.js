'use strict';

// Parse multi-model configuration from environment variables.
// Format:
//   RA_MODELS=deepseek,qwen,gpt4        (comma-separated model IDs)
//   RA_MODEL_DEEPSEEK_NAME=DeepSeek      (display name)
//   RA_MODEL_DEEPSEEK_ENDPOINT=https://...
//   RA_MODEL_DEEPSEEK_TOKEN=...
//   RA_MODEL_DEEPSEEK_MODEL=default      (model name sent to API)
//
// Falls back to legacy single-model RA_LLM_* vars if RA_MODELS is not set.

function parseModels() {
  const modelIds = (process.env.RA_MODELS || '').split(',').map(s => s.trim()).filter(Boolean);

  if (modelIds.length > 0) {
    return modelIds.map(id => {
      const prefix = `RA_MODEL_${id.toUpperCase().replace(/[-.]/g, '_')}_`;
      return {
        id,
        name: process.env[`${prefix}NAME`] || id,
        endpoint: process.env[`${prefix}ENDPOINT`] || '',
        token: process.env[`${prefix}TOKEN`] || '',
        model: process.env[`${prefix}MODEL`] || 'default',
        useProxy: process.env[`${prefix}USE_PROXY`] === '1',
      };
    });
  }

  // Legacy single-model fallback
  return [{
    id: 'default',
    name: 'Default',
    endpoint: process.env.RA_LLM_ENDPOINT || 'http://localhost:8080/v1/chat/completions',
    token: process.env.RA_LLM_TOKEN || '',
    model: process.env.RA_LLM_MODEL || 'default',
  }];
}

const models = parseModels();

// Per-agent model overrides
function parseAgentModels() {
  const agentModels = {};
  const agentNames = ['files', 'web', 'literature'];
  const envKeys = ['RA_AGENT_FILES_MODEL', 'RA_AGENT_WEB_MODEL', 'RA_AGENT_LITERATURE_MODEL'];
  const agentIds = ['files_and_compute', 'web_research', 'literature'];

  for (let i = 0; i < agentNames.length; i++) {
    const modelId = process.env[envKeys[i]];
    if (modelId) {
      agentModels[agentIds[i]] = modelId;
    }
  }
  return agentModels;
}

const agentModelOverrides = parseAgentModels();

const config = {
  models,
  defaultModelId: models[0].id,
  maxToolIterations: parseInt(process.env.RA_MAX_TOOL_ITERATIONS || '50', 10),
  maxFileSize: parseInt(process.env.RA_MAX_FILE_SIZE || '102400', 10),
  allowedPaths: (process.env.RA_ALLOWED_PATHS || '/home,/scratch,/work').split(',').map(p => p.trim()),
  scheduler: process.env.RA_SCHEDULER || 'slurm',
  // Agent mode: 'single' (default) or 'multi' (orchestrator + sub-agents)
  agentMode: process.env.RA_AGENT_MODE || 'single',
  agentMaxIterations: parseInt(process.env.RA_AGENT_MAX_ITERATIONS || '8', 10),
  // Branding (override via env vars for custom deployments)
  branding: {
    appName: process.env.RA_APP_NAME || 'Research Agent',
    appNameZh: process.env.RA_APP_NAME_ZH || '',
    appFullName: process.env.RA_APP_FULL_NAME || 'Research Agent',
    appDescription: process.env.RA_APP_DESCRIPTION || '',
    appOrg: process.env.RA_APP_ORG || '',
  },
};

config.getModel = function(modelId) {
  return models.find(m => m.id === modelId) || models[0];
};

/**
 * Get model config for a sub-agent, using per-agent override if set.
 * Returns null if no override (caller should fall back to user-selected model).
 */
config.getAgentModel = function(agentName) {
  const overrideId = agentModelOverrides[agentName];
  if (!overrideId) return null;
  return models.find(m => m.id === overrideId) || null;
};

module.exports = config;
