'use strict';

const fs = require('fs');
const path = require('path');
const { streamChat } = require('./llm-client');
const { getSystemPrompt } = require('./system-prompt');
const { toolDefinitions, executeTool, getToolSubset } = require('./tools');

const WEB_TOOL_NAMES = new Set(['web_search', 'fetch_url', 'search_papers', 'get_paper', 'search_wos']);
const WEB_AGENT_NAMES = new Set(['web_research', 'literature']);

function filterToolsForWebSearch(tools, webSearchEnabled) {
  if (webSearchEnabled) return tools;
  return tools.filter(td => {
    const name = td.function?.name;
    return !WEB_TOOL_NAMES.has(name) && !WEB_AGENT_NAMES.has(name);
  });
}
const { confirmations } = require('./confirmations');
const config = require('./config');

const LOG_FILE = path.join(process.env.HOME || '/tmp', '.research-agent', 'agent-debug.log');
function debugLog(msg) {
  try {
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
}

/**
 * Core LLM loop shared by single-agent and sub-agents.
 * Streams SSE events to the client, executes tool calls, and loops until done.
 *
 * @param {Object} res - Express response (SSE stream)
 * @param {Array} messages - conversation messages (mutated in place)
 * @param {Array} tools - tool definitions for the LLM
 * @param {Object} modelConfig - model endpoint/token/model
 * @param {number} maxIterations - max tool iterations
 * @param {number} timeout - timeout in ms
 * @returns {string} final assistant content from the last iteration
 */
async function runLLMLoop(res, messages, tools, modelConfig, maxIterations, timeout, options = {}) {
  let iteration = 0;
  let lastActivity = Date.now();
  let lastContent = '';

  while (iteration < maxIterations) {
    if (Date.now() - lastActivity > timeout) {
      sendSSE(res, 'error', { text: 'Agent loop timed out.' });
      break;
    }

    iteration++;
    lastActivity = Date.now();

    let assistantContent = '';
    let reasoningContent = '';
    let toolCalls = [];
    let finishReason = null;

    try {
      const stream = streamChat(messages, tools, modelConfig, options);

      for await (const chunk of stream) {
        const choice = chunk.choices && chunk.choices[0];
        if (!choice) continue;

        const delta = choice.delta || {};
        finishReason = choice.finish_reason || finishReason;

        const reasoningDelta = delta.reasoning_content || delta.reasoning;
        if (reasoningDelta) {
          reasoningContent += reasoningDelta;
          sendSSE(res, 'reasoning', { text: reasoningDelta });
        }

        if (delta.content) {
          assistantContent += delta.content;
          sendSSE(res, 'content', { text: delta.content });
        }

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index;
            if (!toolCalls[idx]) {
              toolCalls[idx] = {
                id: tc.id || '',
                type: 'function',
                function: { name: '', arguments: '' },
              };
            }
            if (tc.id) toolCalls[idx].id = tc.id;
            if (tc.function) {
              if (tc.function.name) toolCalls[idx].function.name += tc.function.name;
              if (tc.function.arguments) toolCalls[idx].function.arguments += tc.function.arguments;
            }
          }
        }
      }
    } catch (err) {
      sendSSE(res, 'error', { text: `LLM error: ${err.message}` });
      break;
    }

    const assistantMessage = { role: 'assistant' };
    if (assistantContent) assistantMessage.content = assistantContent;
    if (reasoningContent) assistantMessage.reasoning_content = reasoningContent;
    if (toolCalls.length > 0) assistantMessage.tool_calls = toolCalls;
    messages.push(assistantMessage);

    lastContent = assistantContent;

    if (toolCalls.length === 0 || finishReason === 'stop') {
      break;
    }

    for (const tc of toolCalls) {
      const toolName = tc.function.name;
      let toolArgs;
      try {
        toolArgs = JSON.parse(tc.function.arguments);
      } catch {
        toolArgs = {};
      }

      sendSSE(res, 'tool_call', {
        id: tc.id,
        name: toolName,
        args: toolArgs,
      });

      let result;
      try {
        // Strip 'confirmed' from LLM args — only the confirmation flow should set this
        delete toolArgs.confirmed;
        result = await executeTool(toolName, toolArgs);

        if (result && typeof result === 'object' && result.needsConfirmation) {
          debugLog(`[confirm] Sending tool_confirm for ${toolName} id=${tc.id} command=${result.command}`);
          sendSSE(res, 'tool_confirm', {
            id: tc.id,
            name: toolName,
            command: result.command,
          });
          // Flush proxy buffers
          res.write(': flush\n\n');

          debugLog(`[confirm] Waiting for user response on id=${tc.id}`);
          const approved = await confirmations.create(tc.id);
          debugLog(`[confirm] User responded: approved=${approved} for id=${tc.id}`);
          if (approved) {
            result = await executeTool(toolName, { ...toolArgs, confirmed: true });
          } else {
            result = 'Command was denied by user.';
          }
        }
      } catch (err) {
        debugLog(`[confirm] Error in tool ${toolName}: ${err.message}`);
        result = `Error: ${err.message}`;
      }

      const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
      const truncated = resultStr.length > 50000
        ? resultStr.slice(0, 50000) + '\n...(truncated)'
        : resultStr;

      sendSSE(res, 'tool_result', {
        id: tc.id,
        name: toolName,
        result: truncated,
      });

      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: truncated,
      });

      // Reset activity timer after each tool completes
      lastActivity = Date.now();
    }
  }

  return lastContent;
}

// ---------------------------------------------------------------------------
// Agent definitions for multi-agent mode
// ---------------------------------------------------------------------------

const agentConfigs = {
  files_and_compute: {
    tools: ['read_file', 'write_file', 'list_files', 'display_image', 'run_shell', 'submit_job', 'check_job'],
    buildSystemPrompt(userMessages) {
      // Reuse skill system — match against original user messages
      const { getSkillPrompt } = require('./skills');
      const os = require('os');
      const skillPrompt = getSkillPrompt(userMessages);
      return `You are a files-and-compute agent. You help with filesystem operations, file editing, command execution, and HPC job management.

## Your Tools
- read_file, write_file, list_files — filesystem operations
- display_image — show an image file (.png/.jpg/.gif/.webp/.svg/.bmp) inline in the chat. Use whenever the user asks to see a plot or rendered figure.
- run_shell — run any shell command on the cluster (login shell with user PATH, modules, conda). Read-only commands run silently; anything else asks the user to confirm.
- submit_job, check_job — HPC scheduler operations

## Environment
- User: ${os.userInfo().username}
- Home: ${os.homedir()}
- Scheduler: ${config.scheduler}

## Guidelines
- Confirm before overwriting existing files
- Validate paths and parameters
- For job scripts, ask about partition/account if not specified
- Provide explanations for parameter choices${skillPrompt}`;
    },
  },

  web_research: {
    tools: ['web_search', 'fetch_url'],
    buildSystemPrompt() {
      return `You are a web research agent. You search the web and fetch pages to find information.

## Your Tools
- web_search — search the web for information
- fetch_url — fetch a web page and extract text content

## Guidelines
- Use multiple searches with different queries to get comprehensive results
- Fetch the most relevant pages to extract details
- Synthesize information from multiple sources
- Always provide source URLs for key claims
- Be concise but thorough in your summaries`;
    },
  },

  literature: {
    tools: ['search_papers', 'get_paper', 'search_wos', 'web_search', 'fetch_url'],
    buildSystemPrompt() {
      return `You are a literature research agent. You search academic papers and synthesize findings.

## Your Tools
- search_wos — search Web of Science Core Collection for academic papers with citation counts and JCR journal rankings. Supports WoS syntax: TS=(topic), AU=(author), TI=(title), OG_SMART=(organization). Prefer this for comprehensive literature searches.
- search_papers — search OpenAlex for academic papers (free, broad coverage, includes abstracts and open access links)
- get_paper — get details about a specific paper (by ID, DOI, or ArXiv ID)
- web_search — search the web for supplementary information
- fetch_url — fetch web pages (useful for paper landing pages, project sites)

## Guidelines
- Use search_wos for comprehensive searches — it provides citation counts, JCR quartiles, and WoS Core Collection coverage
- Use search_papers (OpenAlex) as a complement, especially for preprints and open-access content
- Search with varied queries to find comprehensive results
- Use year filters when looking for recent work
- Provide paper titles, authors, publication years, and citation counts
- Summarize key findings and methodologies
- Note highly-cited vs recent papers
- Group papers by approach or sub-topic when relevant`;
    },
  },
};

/**
 * Build the orchestrator system prompt.
 */
function getOrchestratorPrompt(options = {}) {
  const os = require('os');
  const { branding } = config;
  const { appName, appNameZh, appOrg } = branding;
  const nameStr = appNameZh ? `${appName} (${appNameZh})` : appName;
  const orgStr = appOrg ? ` developed for ${appOrg}` : '';
  const webEnabled = !!options.webSearch;

  const webAgentSections = webEnabled ? `

### web_research
Handles web searching and content fetching. Delegate to this agent when the user needs to:
- Search for current information, documentation, or tutorials
- Look up software releases, configuration guides, or troubleshooting
- Find general information not in your knowledge

### literature
Handles academic paper search and literature review. Has access to Web of Science (WoS Core Collection with JCR rankings and citation data) and OpenAlex. Delegate to this agent when the user needs to:
- Find research papers on a topic
- Review literature and summarize findings
- Look up specific papers by DOI or title
- Analyze citation patterns or research trends
- Check journal impact factors or JCR quartiles` : `

Note: Web search and literature search are currently disabled by the user. Do not attempt to fetch external information or search the web; answer from your own knowledge or delegate to files_and_compute only. If the request requires online lookup, tell the user to enable the web-search toggle.`;

  return `You are ${nameStr}, an AI research agent${orgStr}. You help researchers with scientific Q&A, literature review, and setting up computational simulations on HPC clusters.

You work by delegating tasks to specialized agents. For simple factual questions you already know, answer directly without delegating.

## Available Agents

### files_and_compute
Handles filesystem operations, file editing, command execution, simulation file preparation, and HPC job management. Delegate to this agent when the user needs to:
- Read, write, or list files
- Run commands or shell scripts
- Submit or check HPC jobs
- Prepare simulation input files (VASP, LAMMPS, GROMACS, etc.)
${webAgentSections}

## How to Delegate
- Call an agent tool with a clear task description
- You can chain agents: call one, see the result, then call another
- For complex tasks, break them into steps across agents
- Provide enough context in the task description for the agent to work independently

## Current Environment
- User: ${os.userInfo().username}
- Home: ${os.homedir()}`;
}

/**
 * Build tool definitions for the orchestrator (agent tools).
 */
function getAgentToolDefinitions() {
  return [
    {
      type: 'function',
      function: {
        name: 'files_and_compute',
        description: 'Delegate a task to the files-and-compute agent. Handles filesystem operations (read/write/list files), command execution, simulation file preparation, and HPC job submission/monitoring.',
        parameters: {
          type: 'object',
          properties: {
            task: { type: 'string', description: 'Detailed description of what the agent should do' },
          },
          required: ['task'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'web_research',
        description: 'Delegate a task to the web research agent. Handles web searching and page fetching for current information, documentation, tutorials, and general knowledge.',
        parameters: {
          type: 'object',
          properties: {
            task: { type: 'string', description: 'Detailed description of what to search for and what information to find' },
          },
          required: ['task'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'literature',
        description: 'Delegate a task to the literature research agent. Handles academic paper search, literature review, citation analysis, and research synthesis.',
        parameters: {
          type: 'object',
          properties: {
            task: { type: 'string', description: 'Detailed description of the literature search or review task' },
          },
          required: ['task'],
        },
      },
    },
  ];
}

/**
 * Run a sub-agent: sends agent_start, runs an inner LLM loop with filtered tools,
 * sends agent_end, and returns the final content as the tool result.
 */
async function runSubAgent(agentName, task, res, userMessages, modelConfig, options = {}) {
  const agentDef = agentConfigs[agentName];
  if (!agentDef) {
    return `Unknown agent: ${agentName}`;
  }

  sendSSE(res, 'agent_start', { agent: agentName, task });

  // Check for per-agent model override
  const agentModelConfig = config.getAgentModel(agentName) || modelConfig;

  const tools = filterToolsForWebSearch(getToolSubset(agentDef.tools), !!options.webSearch);
  const systemPrompt = agentDef.buildSystemPrompt(userMessages);
  const maxIter = config.agentMaxIterations;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: task },
  ];

  const result = await runLLMLoop(res, messages, tools, agentModelConfig, maxIter, 120000, options);

  sendSSE(res, 'agent_end', { agent: agentName });

  return result || '(Agent completed without text output)';
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Run the agent loop: LLM -> tool calls -> LLM -> ... -> final response.
 * In single mode: one LLM with all tools (original behavior).
 * In multi mode: orchestrator delegates to sub-agents.
 *
 * @param {Object} res - Express response (SSE stream)
 * @param {Array} userMessages - conversation messages from client
 * @param {string} modelId - selected model ID
 */
async function runAgentLoop(res, userMessages, modelId, options = {}) {
  const modelConfig = config.getModel(modelId);

  // Global heartbeat keeps proxy connections alive throughout the entire loop
  const globalHeartbeat = setInterval(() => {
    if (!res.destroyed) res.write(': heartbeat\n\n');
  }, 15000);

  try {
  if (config.agentMode === 'multi') {
    // --- Multi-agent: orchestrator + sub-agents ---
    const systemMessage = { role: 'system', content: getOrchestratorPrompt(options) };
    const messages = [systemMessage, ...userMessages];
    const agentTools = filterToolsForWebSearch(getAgentToolDefinitions(), !!options.webSearch);

    let iteration = 0;
    const maxIterations = config.maxToolIterations;
    let lastActivity = Date.now();
    const timeout = 120000;

    while (iteration < maxIterations) {
      if (Date.now() - lastActivity > timeout) {
        sendSSE(res, 'error', { text: 'Orchestrator loop timed out.' });
        break;
      }

      iteration++;
      lastActivity = Date.now();

      let assistantContent = '';
      let reasoningContent = '';
      let toolCalls = [];
      let finishReason = null;

      try {
        const stream = streamChat(messages, agentTools, modelConfig, options);

        for await (const chunk of stream) {
          const choice = chunk.choices && chunk.choices[0];
          if (!choice) continue;

          const delta = choice.delta || {};
          finishReason = choice.finish_reason || finishReason;

          const reasoningDelta = delta.reasoning_content || delta.reasoning;
          if (reasoningDelta) {
            reasoningContent += reasoningDelta;
            sendSSE(res, 'reasoning', { text: reasoningDelta });
          }

          if (delta.content) {
            assistantContent += delta.content;
            sendSSE(res, 'content', { text: delta.content });
          }

          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index;
              if (!toolCalls[idx]) {
                toolCalls[idx] = {
                  id: tc.id || '',
                  type: 'function',
                  function: { name: '', arguments: '' },
                };
              }
              if (tc.id) toolCalls[idx].id = tc.id;
              if (tc.function) {
                if (tc.function.name) toolCalls[idx].function.name += tc.function.name;
                if (tc.function.arguments) toolCalls[idx].function.arguments += tc.function.arguments;
              }
            }
          }
        }
      } catch (err) {
        sendSSE(res, 'error', { text: `LLM error: ${err.message}` });
        break;
      }

      const assistantMessage = { role: 'assistant' };
      if (assistantContent) assistantMessage.content = assistantContent;
      if (reasoningContent) assistantMessage.reasoning_content = reasoningContent;
      if (toolCalls.length > 0) assistantMessage.tool_calls = toolCalls;
      messages.push(assistantMessage);

      if (toolCalls.length === 0 || finishReason === 'stop') {
        break;
      }

      // Execute agent tool calls (sub-agents)
      for (const tc of toolCalls) {
        const agentName = tc.function.name;
        let toolArgs;
        try {
          toolArgs = JSON.parse(tc.function.arguments);
        } catch {
          toolArgs = {};
        }

        sendSSE(res, 'tool_call', {
          id: tc.id,
          name: agentName,
          args: toolArgs,
        });

        let result;
        try {
          result = await runSubAgent(agentName, toolArgs.task || '', res, userMessages, modelConfig, options);
        } catch (err) {
          result = `Agent error: ${err.message}`;
        }

        const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
        const truncated = resultStr.length > 50000
          ? resultStr.slice(0, 50000) + '\n...(truncated)'
          : resultStr;

        sendSSE(res, 'tool_result', {
          id: tc.id,
          name: agentName,
          result: truncated,
        });

        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: truncated,
        });

        lastActivity = Date.now();
      }
    }
  } else {
    // --- Single-agent: original behavior ---
    const systemMessage = { role: 'system', content: getSystemPrompt(userMessages, options) };
    const messages = [systemMessage, ...userMessages];
    const singleTools = filterToolsForWebSearch(toolDefinitions, !!options.webSearch);
    await runLLMLoop(res, messages, singleTools, modelConfig, config.maxToolIterations, 120000, options);
  }
  } finally {
    clearInterval(globalHeartbeat);
  }

  sendSSE(res, 'done', {});
}

function sendSSE(res, event, data) {
  if (event === 'tool_confirm') {
    debugLog(`[SSE] Writing tool_confirm event: ${JSON.stringify(data)}`);
  }
  const ok = res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  if (event === 'tool_confirm') {
    debugLog(`[SSE] res.write returned: ${ok}, destroyed: ${res.destroyed}, writableEnded: ${res.writableEnded}`);
  }
}

module.exports = { runAgentLoop };
