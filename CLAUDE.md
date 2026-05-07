# Research Agent

Multi-agent AI research assistant for HPC clusters, deployed via Open OnDemand. Supports both single-agent and multi-agent modes — users choose their preference.

## Branding

All branding is configurable via environment variables — no hardcoded org names in code.

```
RA_APP_NAME=My Assistant              # Short name (header, assistant label)
RA_APP_NAME_ZH=科研助手               # Chinese name (zh-CN locale)
RA_APP_FULL_NAME=My Research Agent    # Full name
RA_APP_DESCRIPTION=...               # App description (optional)
RA_APP_ORG=Research Institute        # Organization (used in system prompt)
```

Defaults to "Research Agent" when env vars are not set. Branding flows through:
- `server/config.js` → parses env vars into `config.branding`
- `app.js` → passes branding to frontend via `window.__RA__.branding`
- `client/lib/i18n.js` → uses branding as overrides for en/zh-CN translations
- `server/system-prompt.js` → uses branding in the LLM system prompt

## Architecture

```
app.js                    Express server (Passenger-compatible)
server/
  config.js               Multi-model config from env vars (RA_MODELS, RA_MODEL_{ID}_*)
  agent-loop.js           Single-agent loop + multi-agent orchestrator with sub-agents
  llm-client.js           OpenAI-compatible streaming client (native https, no proxy)
  system-prompt.js        Dynamic prompt with auto-loaded skills
  sessions.js             Session persistence (~/.research-agent/sessions/)
  confirmations.js        User approval flow for run_shell
  tools/
    index.js              Tool registry (12 tools)
    http-client.js        Shared HTTP client with automatic proxy support
    file-ops.js           read_file, write_file, list_files
    job-ops.js            submit_job, check_job (Slurm/PBS)
    command-ops.js        run_command (safe, execFile) + run_shell (bash, needs confirmation)
    web-search.js         web_search (SearXNG/Tavily/Serper/Bing backends)
    web-fetch.js          fetch_url (HTML→text extraction)
    paper-search.js       search_papers, get_paper (Semantic Scholar)
  skills/
    index.js              Auto-loader, keyword matching against recent messages
    vasp.js               VASP domain knowledge
    lammps.js             LAMMPS domain knowledge
    gromacs.js            GROMACS domain knowledge
    job-scheduler.js      HPC scheduler knowledge
client/
  App.jsx                 Main React app (session state, model selector, confirmation dialog)
  lib/
    sse.js                SSE stream parser
    api.js                Fetch wrapper with CSRF
    i18n.js               en / zh-CN translations
  components/             ChatView, MessageBubble, ThinkingBlock, ToolCallBlock, etc.
  styles.css              Global styles
views/index.hbs           Handlebars template
```

## Agent Modes

Controlled by `RA_AGENT_MODE` (default: `single`).

- **Single mode** (`single`): One LLM in a tool-use loop with access to all 12 tools. Uses dynamic skill injection for domain knowledge.
- **Multi mode** (`multi`): An orchestrator LLM delegates to three specialized sub-agents:
  - **files_and_compute** — file ops, command execution, HPC job management (+ skill injection)
  - **web_research** — web search and page fetching
  - **literature** — academic paper search (Web of Science, OpenAlex) and literature review

The orchestrator answers simple factual questions directly and delegates complex tasks to sub-agents. Each sub-agent runs its own LLM loop with a filtered tool set. Per-agent model overrides are supported.

## Environment Variables

Multi-model config:
```
RA_MODELS=deepseek,qwen3-32b           # Comma-separated model IDs
RA_MODEL_DEEPSEEK_NAME=DeepSeek         # Display name
RA_MODEL_DEEPSEEK_ENDPOINT=https://...  # OpenAI-compatible endpoint
RA_MODEL_DEEPSEEK_TOKEN=...             # Bearer token
RA_MODEL_DEEPSEEK_MODEL=default         # Model name sent to API
```

ID → env var prefix: uppercase, hyphens and dots become underscores.
`deepseek-v3.2` → `RA_MODEL_DEEPSEEK_V3_2_*`

Other vars:
```
RA_SEARCH_ENGINE=searxng|tavily|serper|bing   # Default: searxng
RA_SEARCH_ENDPOINT=http://localhost:8888       # SearXNG only
RA_SEARCH_API_KEY=...                          # Required for tavily/serper/bing
RA_MAX_TOOL_ITERATIONS=10
RA_MAX_FILE_SIZE=102400
RA_ALLOWED_PATHS=/home,/scratch,/work
RA_SCHEDULER=slurm
RA_AGENT_MODE=single|multi                    # Default: single
RA_AGENT_MAX_ITERATIONS=8                     # Max iterations per sub-agent
```

## Deployment (Open OnDemand)

- **Dev app**: `~/ondemand/dev/research-agent/`
- **Sys app**: `/var/www/ood/apps/sys/research-agent/`
- **Env vars** for sys app go in `pun_custom_env` in `/etc/ood/config/nginx_stage.yml` (not the app env file, since tokens must be hidden from users)
- Restart sys app: `sudo touch /var/www/ood/apps/sys/research-agent/tmp/restart.txt`
- **Never kill Passenger watchdog** — use `touch tmp/restart.txt` instead

## Build

```bash
npx esbuild client/index.jsx --bundle --outfile=public/dist/index.js --loader:.jsx=jsx
```

## Key Design Decisions

- **Agent architecture**: Single mode gives one LLM all tools; multi mode uses an orchestrator that delegates to sub-agents with scoped tool sets. Both share the same `agentLoop()` core in `agent-loop.js`. Sub-agents can use different models via per-agent overrides.
- **Proxy support**: `http-client.js` auto-detects `http_proxy`/`https_proxy` env vars. Uses HTTP CONNECT tunnel for HTTPS targets. Skips proxy for localhost. All external HTTP tools (fetch_url, paper-search, web-search with Serper/Bing/Tavily) use this shared client. SearXNG is local so no proxy needed.
- **Two-tier commands**: `run_command` uses `execFile` (safe, no shell) for allowlisted commands. `run_shell` uses `exec` through bash with user confirmation dialog. Dangerous patterns (rm -rf /, mkfs, etc.) are always blocked.
- **Search engines**: SearXNG default uses `bing,sogou,quark` for Chinese queries and `bing,yandex,quark` for English. Engines may get CAPTCHA-suspended temporarily (1h auto-recover). Tavily is the recommended API alternative (1000 free searches/month).
- **Skill system**: Skills auto-load from `server/skills/` directory. Each exports `{ name, keywords, promptContent }`. Matched by keyword against last 3 user messages and injected into system prompt.
- **Session history**: Stored as JSON in `~/.research-agent/sessions/`. Client sends full conversation history with proper OpenAI message format (user, assistant with tool_calls, tool results).

## Known Issues

- **DeepSeek reasoning_content bug**: Some DeepSeek-compatible gateways sometimes put actual response content in `reasoning_content` field instead of `content` during streaming. No workaround applied — documented only.
- **SearXNG engine suspensions**: Heavy usage can trigger CAPTCHA-based suspensions on scraped engines (sogou, yandex). Auto-recovers after 1 hour.

## Syncing to Remote

```bash
# Sync code
rsync -az --no-perms -e "ssh -i KEY" ./server/ user@host:~/ondemand/dev/research-agent/server/
rsync -az --no-perms -e "ssh -i KEY" ./client/ user@host:~/ondemand/dev/research-agent/client/

# Copy to sys app
sudo rsync -a ~/ondemand/dev/research-agent/ /var/www/ood/apps/sys/research-agent/

# Rebuild frontend on remote
cd ~/ondemand/dev/research-agent && npx esbuild client/index.jsx --bundle --outfile=public/dist/index.js --loader:.jsx=jsx
```
