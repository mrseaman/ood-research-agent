# Research Agent — Self-Hosted AI Assistant for HPC Clusters & Open OnDemand

> An open-source, self-hosted **AI research assistant for HPC clusters**. It runs as an **[Open OnDemand](https://openondemand.org/)** web app, talks to any **OpenAI-compatible LLM**, and can read your files, submit and monitor **Slurm/PBS** jobs, run shell commands, and search the scientific literature — all from a chat window on your cluster.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A518-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Open OnDemand](https://img.shields.io/badge/Open%20OnDemand-compatible-orange)](https://openondemand.org/)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](docs/DEVELOPMENT.md)

Think of it as a **ChatGPT-style copilot that lives on your supercomputer**: a chat interface that understands Slurm and PBS, runs in a real login shell with your modules and conda environments, renders simulation images inline, and reviews papers from Web of Science and OpenAlex — without sending your data to a third party. Bring your own LLM endpoint (private vLLM, DeepSeek, Qwen, GPT-4o, Claude via an OpenAI-compatible proxy, etc.).

![Research Agent web interface running on an HPC cluster via Open OnDemand: a chat sidebar with sessions and a file browser alongside a welcome screen suggesting prompts such as setting up a VASP relaxation, writing a Slurm job script for a 4-node DFT calculation, and comparing MD force fields for polymer membrane simulations](docs/screenshot.png)

<p align="center"><sub>Research Agent's chat interface on an HPC login node — Slurm/PBS-aware prompts, file browser, thinking and web-search toggles.</sub></p>

## Table of contents

- [What is this?](#what-is-this)
- [Who is it for?](#who-is-it-for)
- [Features](#features)
- [Quick start](#quick-start)
- [FAQ](#faq)
- [How it compares](#how-it-compares)
- [Documentation](#documentation)
- [Tech stack](#tech-stack)
- [License](#license)

## What is this?

**Research Agent** is a multi-agent AI assistant designed for **high-performance computing (HPC)** and **scientific computing** environments. It is deployed as a per-user [Open OnDemand](https://openondemand.org/) Passenger app, so researchers reach it from the same portal they already use to launch Jupyter or RStudio sessions.

Unlike a generic chatbot, Research Agent is **cluster-native**: it submits and parses Slurm/PBS jobs, executes commands through a real login shell (so `module load`, conda, and your `PATH` work), displays `.png`/figure outputs inline, and pulls in domain knowledge for tools like **VASP, LAMMPS, and GROMACS**. It is **self-hosted and model-agnostic** — point it at any OpenAI-compatible chat completions endpoint.

## Who is it for?

- **HPC sysadmins & research-computing teams** who want to offer an LLM assistant to cluster users without shipping institutional data to a SaaS vendor.
- **Computational scientists** (DFT, MD, CFD, bioinformatics) who want an agent that can read inputs/outputs, submit jobs, and review literature in one place.
- **Self-hosting / privacy-focused groups** that need an on-prem AI assistant wired to a private model endpoint.

## Features

- **One or many agents** — a single LLM with all tools, or an orchestrator that delegates to specialized sub-agents (files + compute, web research, literature review).
- **HPC-native job control** — submits and monitors **Slurm and PBS** jobs, parses scheduler output, understands environment modules and conda. Commands run through a real **login shell**.
- **Bring your own LLM** — any **OpenAI-compatible** endpoint (private vLLM/DeepSeek/Qwen, GPT-4o, or Claude/others via a compatible proxy). Admins ship system-wide models; users can add their own API keys in the UI.
- **Scientific literature search** — query **Web of Science** and **OpenAlex**, fetch and summarize papers without leaving the cluster.
- **Web search & fetch** — pluggable backends (SearXNG, Tavily, Serper, Bing), gated behind an explicit toggle.
- **Renders images inline** — point the agent at a simulation snapshot or plot and it appears in the chat.
- **Two ways to drive the shell** — let the agent run commands with confirmation, or type `!cmd` yourself in bash mode.
- **Reasoning controls** — toggle model thinking on/off and watch the reasoning stream live.
- **Open OnDemand–ready** — Passenger-compatible, per-user sessions in `~/.research-agent`, CSRF that survives app restarts, proxy-aware HTTP.
- **Bilingual & themeable** — English and 简体中文, light and dark themes.

## Quick start

If you already have a Node.js host and an OpenAI-compatible LLM endpoint:

```bash
git clone https://github.com/mrseaman/ood-research-agent.git ~/ondemand/dev/research-agent
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

For the full Open OnDemand integration and production setup, see the **[Deployment Guide](docs/DEPLOYMENT.md)**.

## FAQ

**How do I add an AI / ChatGPT-style assistant to an HPC cluster?**
Deploy Research Agent as an Open OnDemand app and point it at any OpenAI-compatible LLM endpoint. Users get a chat interface that can submit Slurm/PBS jobs and read their files. See the [Deployment Guide](docs/DEPLOYMENT.md).

**Can an LLM submit and monitor Slurm or PBS jobs for me?**
Yes. Research Agent has built-in `submit_job`/`check_job` tools that wrap Slurm and PBS and parse scheduler output.

**Is it self-hosted? Does my data leave the cluster?**
It is fully self-hosted. The only outbound traffic is to the LLM endpoint *you* configure and to web/literature search backends *if* you enable that toggle. Use a private model endpoint to keep everything on-prem.

**Which LLMs are supported?**
Any OpenAI-compatible `/chat/completions` endpoint — private vLLM deployments, DeepSeek, Qwen, GPT-4o, or Claude and others through an OpenAI-compatible proxy.

**Does it work without internet access?**
Yes. Web and literature search are optional and off by default; with a local model endpoint the agent runs fully air-gapped.

**Does it know about VASP / LAMMPS / GROMACS?**
Yes — domain "skills" inject tool-specific knowledge into the prompt when relevant. New skills are easy to add (see the [Development Guide](docs/DEVELOPMENT.md)).

## How it compares

Most "ChatGPT for science" tools are hosted SaaS that require uploading data, or generic chatbots with no cluster awareness. Research Agent is the rare option that is **self-hosted, model-agnostic, and HPC-native** — it lives inside Open OnDemand, runs in your users' login shell, and speaks Slurm/PBS natively. If you run an HPC cluster and want an AI assistant without a data-governance headache, this is built for that.

## Documentation

- **[User Guide](docs/USER_GUIDE.md)** — for researchers using the app
- **[Deployment Guide](docs/DEPLOYMENT.md)** — for sysadmins setting up the Open OnDemand app
- **[Development Guide](docs/DEVELOPMENT.md)** — for contributors and tool authors
- **[CLAUDE.md](CLAUDE.md)** — context file for AI coding agents (Claude Code, etc.)

## Tech stack

Node.js (≥18) · Express 5 · React 18 · esbuild · Open OnDemand / Phusion Passenger · OpenAI-compatible streaming API · Slurm / PBS · SearXNG · OpenAlex · Web of Science.

## License

[MIT](LICENSE) © contributors. Issues and pull requests welcome — see the [Development Guide](docs/DEVELOPMENT.md).

---

<sub>**Keywords:** HPC AI assistant · Open OnDemand LLM app · self-hosted ChatGPT for HPC · Slurm AI agent · PBS job automation · scientific computing copilot · LLM for research clusters · OpenAI-compatible chatbot · VASP / LAMMPS / GROMACS assistant · on-premise research assistant · multi-agent LLM · Web of Science / OpenAlex literature search.</sub>
