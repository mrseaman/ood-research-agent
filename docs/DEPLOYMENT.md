# Deployment Guide

How to install and configure Research Agent as an Open OnDemand app.

## Prerequisites

- Open OnDemand 3.x (other versions may work; tested on 3.x).
- Node.js 18+ available to Passenger (OOD's default is `passenger_nodejs` in `nginx_stage.yml`).
- An OpenAI-compatible chat-completions endpoint (vLLM, llama-cpp-server, DashScope, public DeepSeek, Anthropic via OpenAI shim, etc.).

## Install

There are two app slots in OOD: per-user dev apps and the shared sys app. Develop against your own dev copy, then promote to sys.

```bash
# Dev install — under your home
git clone <this-repo> ~/ondemand/dev/research-agent
cd ~/ondemand/dev/research-agent
npm install
npx esbuild client/index.jsx --bundle --outfile=public/dist/index.js --loader:.jsx=jsx
```

The dev app is reachable at `/pun/dev/<user>/research-agent`.

To promote to the sys app once you're happy:

```bash
sudo rsync -a --delete --exclude tmp ~/ondemand/dev/research-agent/ /var/www/ood/apps/sys/research-agent/
sudo touch /var/www/ood/apps/sys/research-agent/tmp/restart.txt
```

The sys app is reachable at `/pun/sys/research-agent`.

## Environment variables

API tokens must not be exposed to the user's environment, so put them in `pun_custom_env` in `/etc/ood/config/nginx_stage.yml` (not in a `.env` file inside the app). Example block:

```yaml
pun_custom_env:
  # --- Models ---
  RA_MODELS: "deepseek,qwen3-32b"

  RA_MODEL_DEEPSEEK_NAME: "DeepSeek"
  RA_MODEL_DEEPSEEK_ENDPOINT: "https://api.deepseek.com/chat/completions"
  RA_MODEL_DEEPSEEK_TOKEN: "sk-..."
  RA_MODEL_DEEPSEEK_MODEL: "deepseek-chat"
  RA_MODEL_DEEPSEEK_USE_PROXY: "1"

  RA_MODEL_QWEN3_32B_NAME: "Qwen3 32B"
  RA_MODEL_QWEN3_32B_ENDPOINT: "https://internal-vllm.example/v1/chat/completions"
  RA_MODEL_QWEN3_32B_TOKEN: "..."
  RA_MODEL_QWEN3_32B_MODEL: "qwen3-32b"

  # --- Search ---
  RA_SEARCH_ENGINE: "tavily"           # searxng | tavily | serper | bing
  RA_SEARCH_API_KEY: "tvly-..."

  # --- Behavior ---
  RA_AGENT_MODE: "single"              # single | multi
  RA_MAX_TOOL_ITERATIONS: "10"
  RA_AGENT_MAX_ITERATIONS: "8"
  RA_MAX_FILE_SIZE: "102400"
  RA_ALLOWED_PATHS: "/home,/scratch,/work"
  RA_SCHEDULER: "slurm"                # slurm | pbs
  RA_SHELL_AUTO_APPROVE: "git,make"    # extra prefixes appended to the in-code allowlist

  # --- Optional: proxy with embedded creds ---
  http_proxy: "http://user:pass@10.0.0.1:8080"
  https_proxy: "http://user:pass@10.0.0.1:8080"
  no_proxy: "10.0.0.0/8,localhost,.internal"

  # --- Optional: branding ---
  RA_APP_NAME: "Research Agent"
  RA_APP_NAME_ZH: "科研助手"
  RA_APP_ORG: "Your Institute"
```

After editing `nginx_stage.yml`, run `sudo /opt/ood/nginx_stage/sbin/update_ood_portal` (or your distro's equivalent) and restart the per-user Nginx (`touch tmp/restart.txt` inside the app dir).

### Multi-model env conventions

- `RA_MODELS` is a comma-separated list of model **IDs**. Each ID becomes the env-var prefix after upcasing and replacing `-` / `.` with `_`. So `deepseek-v4-pro` → `RA_MODEL_DEEPSEEK_V4_PRO_*`.
- For each ID, set `_NAME`, `_ENDPOINT`, `_TOKEN`, `_MODEL`. `_USE_PROXY=1` routes that endpoint via `http_proxy`/`https_proxy`; omit for internal endpoints.
- The first ID in `RA_MODELS` is the default selected model in the UI.

### Per-agent model overrides (multi mode)

If different sub-agents should use different models, add `RA_AGENT_MODEL_<AGENT>=<modelId>`:

```yaml
RA_AGENT_MODEL_LITERATURE: "deepseek"
RA_AGENT_MODEL_WEB_RESEARCH: "qwen3-32b"
```

Agents without an override fall back to the user-selected model.

## Search engines

- **SearXNG** (default if `RA_SEARCH_ENGINE` unset): runs locally on `localhost:8888` (set `RA_SEARCH_ENDPOINT` if different). No key. Defaults to `bing,sogou,quark` for Chinese queries, `bing,yandex,quark` for English. Heavy use can trigger CAPTCHA suspensions on scraped engines (auto-recover ~1h).
- **Tavily** — recommended cloud option. 1000 free searches/month at the time of writing. Set `RA_SEARCH_ENGINE=tavily` and `RA_SEARCH_API_KEY=tvly-...`.
- **Serper** — Google-style results. `RA_SEARCH_ENGINE=serper`, `RA_SEARCH_API_KEY=...`.
- **Bing Web Search API** — `RA_SEARCH_ENGINE=bing`, `RA_SEARCH_API_KEY=...`.

## Web of Science (optional)

If your institution has a WoS subscription:

```yaml
RA_WOS_USERNAME: "..."
RA_WOS_PASSWORD: "..."
```

Without these, only OpenAlex paper search is available.

## File-system safety

`RA_ALLOWED_PATHS` restricts every file-touching tool (`read_file`, `write_file`, `list_files`, `display_image`, `/api/image`, `/api/files`) to subtrees under those prefixes. Sensitive files (`.ssh`, `.gnupg`, `.env`, shell rc files) are denied even within an allowed path. Set this conservatively — typically `/home,/scratch,/work` on an HPC cluster.

## OOD dashboard tile

`manifest.yml` controls the dashboard tile. The `url:` field must match where the app is served:
- Sys app: `url: /pun/sys/research-agent`
- Dev app: not shown on the dashboard.

If you rename the sys directory, update both `manifest.yml` and the URL field. Existing user bookmarks at the old URL will break.

## Restart procedure

Never kill the Passenger watchdog. To restart:

```bash
sudo touch /var/www/ood/apps/sys/research-agent/tmp/restart.txt
```

Passenger picks this up on the next request.

## Where user data lives

Each user gets a directory tree under their home:

```
~/.research-agent/
├── csrf-secret          # persistent CSRF secret (survives Passenger restarts)
├── sessions/            # chat history as JSON, one file per session
├── config/
│   └── models.json      # user-added LLM endpoints (mode 0600)
└── agent-debug.log      # last-resort debug log (only written under specific failures)
```

Sessions are JSON; deleting them is safe. The `csrf-secret` will be regenerated if removed.

## Logs

Passenger's per-user error log (`/var/log/ondemand-nginx/<user>/error.log` by default) shows app stdout/stderr including model API errors. `console.log` and `console.warn` from the Node process land here. If a user reports a problem, that log + the user's session JSON is usually enough to reproduce.

## Upgrading

```bash
cd ~/ondemand/dev/research-agent
git pull
npm install
npx esbuild client/index.jsx --bundle --outfile=public/dist/index.js --loader:.jsx=jsx
# then promote to sys:
sudo rsync -a --delete --exclude tmp ./ /var/www/ood/apps/sys/research-agent/
sudo touch /var/www/ood/apps/sys/research-agent/tmp/restart.txt
```

User data in `~/.research-agent` is untouched by upgrades.
