# Research Agent

A multi-agent AI research assistant for HPC clusters, deployed as an Open OnDemand app. Built for scientists who want to talk to an LLM that can read their files, submit jobs, search the literature, and run shell commands on the cluster.

## Highlights

- **One or many agents** — single LLM with all tools, or an orchestrator that delegates to specialized sub-agents (files+compute, web research, literature).
- **HPC-native** — submits Slurm/PBS jobs, parses scheduler output, knows about modules and conda. Commands run through a real login shell so the user's `PATH` and toolchains are available.
- **Real reasoning controls** — toggle thinking on/off, gate web search, and watch the model's reasoning stream live.
- **Renders images** — point the agent at a `.png` simulation snapshot and it's shown inline.
- **Two ways to drive shell** — let the agent run commands with confirmation, or type `!cmd` yourself in bash mode.
- **Bring your own LLM** — admins ship system-wide models via `pun_custom_env`; each user can also configure their own API keys through the UI.
- **Open OnDemand–ready** — Passenger-compatible, per-user sessions in `~/.research-agent`, CSRF that survives restarts.
- **Bilingual** — English and 简体中文 with one click. Light and dark themes.

## Documentation

- **[User Guide](docs/USER_GUIDE.md)** — for researchers using the app
- **[Deployment Guide](docs/DEPLOYMENT.md)** — for sysadmins setting up the OOD app
- **[Development Guide](docs/DEVELOPMENT.md)** — for contributors and tool authors
- **[CLAUDE.md](CLAUDE.md)** — context file for AI coding agents (Claude Code, etc.)

## Quick start

If you already have a Node.js host and an OpenAI-compatible LLM endpoint, the shortest path is:

```bash
git clone <this-repo> ~/ondemand/dev/research-agent
cd ~/ondemand/dev/research-agent
npm install
npx esbuild client/index.jsx --bundle --outfile=public/dist/index.js --loader:.jsx=jsx
RA_MODELS=demo \
RA_MODEL_DEMO_NAME=Demo \
RA_MODEL_DEMO_ENDPOINT=https://api.openai.com/v1/chat/completions \
RA_MODEL_DEMO_TOKEN=sk-... \
RA_MODEL_DEMO_MODEL=gpt-4o-mini \
node app.js
```

For the OOD integration and production setup, see the [Deployment Guide](docs/DEPLOYMENT.md).
