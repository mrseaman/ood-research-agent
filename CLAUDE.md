# Research Agent

Multi-agent AI research assistant for HPC clusters, deployed via Open OnDemand. Supports both single-agent and multi-agent modes — users choose their preference.

## Branding

All branding is configurable via environment variables — no hardcoded org names in code.

```
RA_APP_NAME=My Agent              # Short name (header, assistant label)
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
                          Endpoints: /api/chat, /api/run-shell, /api/image,
                          /api/csrf, /api/sessions, /api/files, /api/confirm,
                          /api/models, /api/usage
bin/
  usage-report.js         Admin scraper: walks all users' usage logs and
                          renders per-user / org-wide reports (text/json/html)
server/
  config.js               Multi-model config from env vars (RA_MODELS, RA_MODEL_{ID}_*)
  agent-loop.js           Single-agent loop + multi-agent orchestrator with sub-agents
  llm-client.js           OpenAI-compatible streaming client (native https, proxy-aware)
  system-prompt.js        Dynamic prompt with auto-loaded skills + web-search gating
  sessions.js             Session persistence (~/.research-agent/sessions/)
  usage-log.js            Per-user usage event log (~/.research-agent/usage/YYYY-MM-DD.jsonl)
  pricing.js              Per-user model pricing helper for /api/usage
  confirmations.js        User approval flow for run_shell
  tools/
    index.js              Tool registry (12 tools)
    http-client.js        Shared HTTP client with automatic proxy support
    file-ops.js           read_file, write_file, list_files, display_image
    job-ops.js            submit_job, check_job (Slurm/PBS)
    command-ops.js        run_shell (login bash, auto-approve list + confirm)
    web-search.js         web_search (SearXNG/Tavily/Serper/Bing backends)
    web-fetch.js          fetch_url (HTML→text extraction)
    paper-search.js       search_papers, get_paper (OpenAlex)
    wos-search.js         search_wos (Web of Science)
  skills/
    index.js              Auto-loader, keyword matching against recent messages
    vasp.js               VASP domain knowledge
    lammps.js             LAMMPS domain knowledge
    gromacs.js            GROMACS domain knowledge
    job-scheduler.js      HPC scheduler knowledge
client/
  App.jsx                 Main React app. Persistent sidebar layout, theme/locale
                          state, "!" bash mode, model selector, confirmation dialog
  lib/
    sse.js                SSE stream parser; retries on 403 CSRF errors
    api.js                Fetch wrapper with CSRF token + retry-on-403
    i18n.js               en / zh-CN translations; runtime selector + localStorage
  components/             ChatView, MessageBubble (copy + download .md),
                          ThinkingBlock, ToolCallBlock (inline images),
                          CodeBlock, FileBrowser, SessionSidebar, InputBar,
                          ModelSettings (tabs: Models, Usage),
                          UsagePanel, SessionInfoPanel
  styles.css              Global styles, light/dark via [data-theme]
views/index.hbs           Handlebars template
```

## Agent Modes

Controlled by `RA_AGENT_MODE` (default: `single`).

- **Single mode** (`single`): One LLM in a tool-use loop with access to all 12 tools. Uses dynamic skill injection for domain knowledge.
- **Multi mode** (`multi`): An orchestrator LLM delegates to three specialized sub-agents:
  - **files_and_compute** — file ops, command execution, image display, HPC job management (+ skill injection)
  - **web_research** — web search and page fetching
  - **literature** — academic paper search (Web of Science, OpenAlex) and literature review

The orchestrator answers simple factual questions directly and delegates complex tasks to sub-agents. Each sub-agent runs its own LLM loop with a filtered tool set. Per-agent model overrides are supported. Web-search and literature delegations are stripped from the orchestrator's tools (and from sub-agent tool sets) when the user toggles the web-search pill off.

## Frontend UI

- **Persistent left sidebar** (260px): brand mark + New Chat, scrollable Sessions list, Files browser rooted at `$HOME`, footer with language selector and theme toggle.
- **Chat card** is a rounded white card (gray-100 backdrop in light, slate in dark). User prompts are subtle gray bubbles aligned left; assistant responses render bubble-less directly on the card. Both rows show copy + download (.md) on hover.
- **Input bar** is centered (max-width 820px); messages span up to 1200px. Pill toggles for thinking and web-search live next to the textarea. Streaming/agent status floats as a pill at the bottom-left of the chat card.
- **Theme**: `[data-theme="dark"|"light"]` on `<html>`. Stored in `localStorage` under `ra-theme`; first paint respects `prefers-color-scheme`.
- **Locale**: stored under `ra-locale`. Selector reloads the page on change (cheaper than threading reactive locale through every `t()` call).
- **Bash mode**: typing `!<cmd>` switches the input border to orange and routes the command to `POST /api/run-shell` instead of `/api/chat`. Bypasses the LLM entirely; `BLOCKED_PATTERNS` still applies server-side.

## Environment Variables

Multi-model config:
```
RA_MODELS=deepseek,qwen3-32b           # Comma-separated model IDs
RA_MODEL_DEEPSEEK_NAME=DeepSeek         # Display name
RA_MODEL_DEEPSEEK_ENDPOINT=https://...  # OpenAI-compatible endpoint
RA_MODEL_DEEPSEEK_TOKEN=...             # Bearer token
RA_MODEL_DEEPSEEK_MODEL=default         # Model name sent to API
RA_MODEL_DEEPSEEK_USE_PROXY=1           # Route via http_proxy/https_proxy
RA_MODEL_DEEPSEEK_COST_INPUT=0.27       # USD per 1M input tokens (optional)
RA_MODEL_DEEPSEEK_COST_OUTPUT=1.10      # USD per 1M output tokens (optional)
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
RA_SHELL_AUTO_APPROVE=git,make                # Append to the in-code auto-approve list
RA_USAGE_RETENTION_DAYS=                      # Prune ~/.research-agent/usage/*.jsonl older than N days (unset = keep forever)
```

## Usage tracking

Each Passenger process appends metadata events (no message content) to
`~/.research-agent/usage/YYYY-MM-DD.jsonl`. Event types: `message_sent`,
`llm_response` (tokens/duration/model/agent), `tool_call`, `error`
(`llm_error`/`tool_error`/`timeout`), `aborted` (user-stop mid-stream).

The Settings dialog has a **Usage** tab showing the user's own messages-per-day,
tokens per model, tool mix, error rate, and cost (computed via
`RA_MODEL_*_COST_INPUT/OUTPUT`). A session-info button (top-right of the chat)
opens a per-session breakdown for the currently-loaded session.

Admin org-wide reports: run `bin/usage-report.js` as root. Reads
`/etc/ood/config/apps/research-agent/pricing.json` (separate from per-user env
so admins can edit prices without per-process reload). See `docs/PRIVACY.md`
for what's logged and `docs/ADMIN_REPORT.md` for runbook.

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
- **Single shell tool**: `run_shell` runs commands through `bash -lc` so the user's interactive PATH, modules, and conda init are available. Read-only commands matching `DEFAULT_AUTO_APPROVE` in `command-ops.js` run silently; everything else triggers a user-confirmation dialog. A hard `BLOCKED_PATTERNS` denylist (rm -rf /, mkfs, fork bomb, etc.) rejects even with user approval. `RA_SHELL_AUTO_APPROVE` appends to the auto-approve list at runtime.
- **Login-shell env**: At server startup `command-ops.js` runs `bash -lc 'env -0'` once and caches the result. Tool executions reuse this env so Passenger's stripped PATH doesn't hide module/conda binaries. Restart the app to pick up `~/.bashrc` changes.
- **Shell working directory tracks the file browser**: `command-ops.js` holds a mutable `shellCwd` (default `$HOME`, exposed via `setShellCwd`/`getShellCwd`). The `/api/files` handler calls `setShellCwd(resolved)` on every successful directory read, so both `!` bash-mode and the agent's `run_shell` execute in whatever directory the sidebar file browser is showing. `runShell` falls back to `$HOME` if that directory no longer exists. Single-user-per-process (OOD Passenger) makes this module-level state safe.
- **CSRF persistence**: The CSRF secret is persisted to `~/.research-agent/csrf-secret` so tokens issued before a Passenger restart remain valid. The client retries failed mutating requests once after fetching a new token from `GET /api/csrf`.
- **Reasoning toggle**: The thinking pill sends `enable_thinking` both as a top-level field (Qwen3/DashScope shape) and inside `chat_template_kwargs` (vLLM shape), so both backend families honor it. `llm-client.js` accepts streamed reasoning under either `delta.reasoning_content` (public DeepSeek) or `delta.reasoning` (vLLM).
- **Web-search gating**: The web-search pill is off by default. When off, the server filters `web_search`/`fetch_url`/`search_papers`/`get_paper`/`search_wos` out of the single-mode tool set and removes the `web_research`/`literature` delegations from the orchestrator. System prompts are adjusted to tell the LLM to ask the user to enable the toggle if online lookup is required.
- **Inline images**: `display_image` returns a short status string for the LLM; the client recognizes the tool name and renders `<img src="/api/image?path=…">`. The endpoint enforces `validatePath` and serves only files matching `IMAGE_EXTS`.
- **Search engines**: SearXNG default uses `bing,sogou,quark` for Chinese queries and `bing,yandex,quark` for English. Engines may get CAPTCHA-suspended temporarily (1h auto-recover). Tavily is the recommended API alternative (1000 free searches/month).
- **Skill system**: Skills auto-load from `server/skills/` directory. Each exports `{ name, keywords, promptContent }`. Matched by keyword against last 3 user messages and injected into system prompt.
- **Session history**: Stored as JSON in `~/.research-agent/sessions/`. Client sends full conversation history with proper OpenAI message format (user, assistant with tool_calls, tool results).

## Known Issues

- **DeepSeek-V4-Pro token degeneration**: The privately-deployed `deepseek-v4-pro` on vLLM occasionally produces garbled tokens mid-reasoning (sequential numbers injected mid-word, `<｜DSML｜>` special tokens leaking into the reasoning channel). Likely speculative-decoding / MTP tokenizer mismatch on the inference side. Toggling the thinking pill off avoids the worst symptoms.
- **SearXNG engine suspensions**: Heavy usage can trigger CAPTCHA-based suspensions on scraped engines (sogou, yandex). Auto-recovers after 1 hour.

## Syncing to Remote

```bash
# Sync source
rsync -az --no-perms -e "ssh -i KEY" ./server/ user@host:~/ondemand/dev/research-agent/server/
rsync -az --no-perms -e "ssh -i KEY" ./client/ user@host:~/ondemand/dev/research-agent/client/
rsync -az --no-perms -e "ssh -i KEY" ./app.js  user@host:~/ondemand/dev/research-agent/app.js

# Copy to sys app
sudo rsync -a ~/ondemand/dev/research-agent/ /var/www/ood/apps/sys/research-agent/

# Rebuild frontend on remote
cd ~/ondemand/dev/research-agent && npx esbuild client/index.jsx --bundle --outfile=public/dist/index.js --loader:.jsx=jsx

# Restart sys app
sudo touch /var/www/ood/apps/sys/research-agent/tmp/restart.txt
```
