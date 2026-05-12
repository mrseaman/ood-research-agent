# User Guide

This guide covers everything you can do from the Research Agent web UI.

## Layout

The app is a three-zone layout:

- **Left sidebar** — brand mark and your tools.
  - **New Chat** button at the top.
  - **Sessions** — your past conversations. Click to reopen; hover to delete.
  - **Files** — a browser rooted at your home directory. Click into folders to navigate; the path at the top updates accordingly.
  - **Footer** — language selector, theme toggle (sun / moon), and a gear icon for model settings.
- **Chat card** — your current conversation in a centered white card.
- **Input bar** — at the bottom of the chat card.

## Starting a conversation

Type a question and hit Enter (Shift+Enter for a newline). The model selector above the chat card lets you pick which LLM to use. Tool-use, reasoning, and final answers stream live.

Each assistant response is plain text on the card; your prompts are shown as gray bubbles. Hover over either to see **Copy** and **Download** buttons:
- **Copy** — copies the message text to your clipboard.
- **Download** — saves the message as a Markdown file named `user-<timestamp>.md` or `assistant-<timestamp>.md`.

## Input bar pills

Two small toggles sit under the textarea:

- **Thinking** (default on) — asks the model to think before answering. Some backends ignore it; if you see reasoning content streaming under each response, it's working.
- **Web search** (default off) — when on, the agent can use `web_search`, `fetch_url`, and paper-search tools. When off, these tools are stripped from the agent's toolbox and it will tell you to enable the toggle if a question needs online lookup. Keep it off if your search API has a usage quota.

## Bash mode (`!`)

Start your input with `!` to skip the LLM entirely and run a shell command on the cluster yourself.

```
!squeue -u $USER
!module avail vasp
!ls ~/simulation
```

The input border turns orange and the textarea switches to a monospace font as a visual cue. Output is shown in a code block in the next bubble. You can use pipes, redirects, env vars, and anything `bash -lc` understands. The dangerous-pattern denylist (`rm -rf /`, `mkfs`, fork bombs, etc.) still applies.

## Running shell commands through the agent

When you ask the agent to do something like "check on my running jobs," it will call the `run_shell` tool. Two paths:

- **Read-only commands** (`ls`, `cat`, `grep`, `squeue`, `module`, `pwd`, `git`, etc.) run silently — the auto-approve list is baked into the server. Pipes and substitutions are never auto-approved.
- **Anything else** pops a confirmation dialog with the exact command. Buttons: **Approve**, **Approve All** (auto-approve the rest of this session), **Deny**.

Errors come back as `Exit code: N\nstdout: …\nstderr: …` so you can see what went wrong.

## Showing images

Ask the agent to "show me the density plot" or "display the snapshot at frame 100" and it will call the `display_image` tool. The image is rendered inline below the tool-call header. Supported: PNG, JPG, GIF, WebP, SVG, BMP. The file must be under one of your allowed paths (typically `/home`, `/scratch`, `/work`).

## Using your own LLM

Click the gear icon in the sidebar footer to open **Your Models**. The left pane lists models you've added; the right pane is a form for adding or editing.

Required fields:
- **Display name** — what you'll see in the dropdown (e.g. "My OpenAI").
- **Endpoint URL** — OpenAI-compatible `…/chat/completions` endpoint.
- **Model name** — the model string sent in the request body (e.g. `gpt-4o`, `claude-3-5-sonnet`).
- **API token** — kept in `~/.research-agent/config/models.json` with mode `0600`. Leave blank when editing to keep the previously stored value.
- **Route through HTTP proxy** — tick this if the endpoint is on the public internet and your cluster requires a proxy. Local/internal endpoints should leave it off.

After saving, your model shows up in the chat-card dropdown under **Your models** (admin-deployed ones are grouped under **System**).

## Language and theme

- **Language** — selector in the sidebar footer. Choices: English / 中文. Choice is saved to your browser; switching reloads the page.
- **Theme** — sun / moon button in the footer. Choice is saved to your browser; respects your OS preference on first visit.

## Sessions

Every conversation is auto-saved to `~/.research-agent/sessions/` as JSON. Click **New Chat** to start fresh; click any past session in the sidebar to reopen it. Delete with the × that appears on hover.

The title is the first ~60 characters of your first prompt; you can't rename from the UI yet.

## File browser

The Files section in the sidebar is a simple navigator over your allowed paths. Click directories to descend, the ↑ button to go up. It's read-only — meant as a reference so you can find paths to paste into prompts.

## Keyboard

- **Enter** — send.
- **Shift+Enter** — newline in the textarea.
- **Esc** in the model-settings or confirmation dialog — close (click outside also works).

## What happens when streaming stops mid-response

If you see "Stop" hit while the agent is mid-stream, or the agent emits something garbled, just send a follow-up. The conversation is saved and will be re-sent on the next turn. The export-session JSON in `~/.research-agent/sessions/<id>.json` is what to share with whoever runs the LLM backend if a model is misbehaving.
