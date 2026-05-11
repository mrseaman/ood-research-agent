'use strict';

const { readFile, writeFile, listFiles, displayImage } = require('./file-ops');
const { submitJob, checkJob } = require('./job-ops');
const { runShell } = require('./command-ops');
const { webSearch } = require('./web-search');
const { fetchUrl } = require('./web-fetch');
const { searchPapers, getPaper } = require('./paper-search');
const { searchWoS, toolDefinition: wosToolDef } = require('./wos-search');

const toolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the contents of a file. Path can use ~ for home directory.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path to read' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write content to a file. Creates parent directories if needed. Path can use ~ for home directory.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path to write' },
          content: { type: 'string', description: 'Content to write' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'display_image',
      description: 'Display an image (PNG, JPG, GIF, WebP, SVG, BMP) from the cluster filesystem inline in the chat. Use this when the user asks to see a plot, snapshot, or rendered figure. The path must be within the user\'s allowed filesystem.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Image file path (supports ~)' },
          caption: { type: 'string', description: 'Optional short caption shown under the image' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List files and directories. Returns entries with [DIR] or [FILE] prefix.',
      parameters: {
        type: 'object',
        properties: {
          directory: { type: 'string', description: 'Directory path (default: home)' },
          pattern: { type: 'string', description: 'Optional glob pattern to filter (e.g., "*.py")' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'submit_job',
      description: 'Submit a job script to the scheduler (Slurm sbatch or PBS qsub).',
      parameters: {
        type: 'object',
        properties: {
          script_path: { type: 'string', description: 'Path to the job script' },
          scheduler: { type: 'string', enum: ['slurm', 'pbs'], description: 'Scheduler type (default: from config)' },
        },
        required: ['script_path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_job',
      description: 'Check the status of a submitted job.',
      parameters: {
        type: 'object',
        properties: {
          job_id: { type: 'string', description: 'Job ID to check' },
          scheduler: { type: 'string', enum: ['slurm', 'pbs'], description: 'Scheduler type (default: from config)' },
        },
        required: ['job_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_shell',
      description: 'Run a command in a login bash shell on the cluster. Supports pipes (|), chaining (&&, ||), redirection (>, >>), subshells, environment modules, conda, and the user\'s full PATH. Plain read-only commands (ls, cat, grep, squeue, module, etc.) run without prompting; anything with shell operators or outside the auto-approve list requires the user to confirm.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to run (e.g., "module load vasp && squeue -u $USER")' },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web for information. Use this for general questions, current events, documentation, or any topic where up-to-date information is needed.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          num_results: { type: 'integer', description: 'Number of results to return (default: 10, max: 20)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fetch_url',
      description: 'Fetch a web page and extract its text content. Use this after web_search to read the full content of a search result page.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to fetch (must start with http:// or https://)' },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_papers',
      description: 'Search academic papers via OpenAlex. Use this to find research papers, review literature, or look up scientific publications. Returns titles, authors, journals, abstracts, citation counts, and DOIs.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query (e.g., "perovskite solar cell efficiency")' },
          num_results: { type: 'integer', description: 'Number of results (default: 10, max: 50)' },
          year_from: { type: 'string', description: 'Filter papers from this year (e.g., "2020")' },
          year_to: { type: 'string', description: 'Filter papers up to this year (e.g., "2025")' },
          sort: { type: 'string', description: 'Sort order: "relevance" (default), "citations", "date_desc", "date_asc"' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_paper',
      description: 'Get detailed information about a specific paper by its DOI or OpenAlex ID. Accepts bare DOI (10.xxx/xxx), full DOI URL, or OpenAlex ID (W1234567890).',
      parameters: {
        type: 'object',
        properties: {
          paper_id: { type: 'string', description: 'Paper identifier (DOI like 10.xxx/xxx, or OpenAlex ID like W1234567890)' },
        },
        required: ['paper_id'],
      },
    },
  },
  wosToolDef,
];

const toolHandlers = {
  read_file: readFile,
  write_file: writeFile,
  list_files: listFiles,
  display_image: displayImage,
  submit_job: submitJob,
  check_job: checkJob,
  run_shell: runShell,
  web_search: webSearch,
  fetch_url: fetchUrl,
  search_papers: searchPapers,
  get_paper: getPaper,
  search_wos: searchWoS,
};

async function executeTool(name, args) {
  const handler = toolHandlers[name];
  if (!handler) {
    throw new Error(`Unknown tool: ${name}`);
  }
  return await handler(args);
}

/**
 * Get a subset of tool definitions by name.
 * @param {string[]} toolNames - names of tools to include
 * @returns {Array} filtered tool definitions
 */
function getToolSubset(toolNames) {
  const nameSet = new Set(toolNames);
  return toolDefinitions.filter(td => nameSet.has(td.function.name));
}

module.exports = { toolDefinitions, executeTool, getToolSubset };
