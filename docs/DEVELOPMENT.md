# Development Guide

For contributors adding tools, skills, UI features, or fixing bugs.

## Local setup

```bash
git clone <this-repo>
cd ood-research-agent
npm install

# Build the frontend
npx esbuild client/index.jsx --bundle --outfile=public/dist/index.js --loader:.jsx=jsx

# Run with at least one model configured
RA_MODELS=demo \
RA_MODEL_DEMO_NAME=Demo \
RA_MODEL_DEMO_ENDPOINT=https://api.openai.com/v1/chat/completions \
RA_MODEL_DEMO_TOKEN=sk-... \
RA_MODEL_DEMO_MODEL=gpt-4o-mini \
node app.js
```

Open `http://localhost:3000`. The app expects to be mounted at `PASSENGER_BASE_URI`; for local dev that's empty and the app serves at `/`.

## Repo layout

```
app.js                    Express server. All HTTP endpoints live here.
server/
  config.js               Parses RA_MODEL_* / RA_AGENT_* env vars; exports models, branding, getModel().
  user-models.js          Per-user models in ~/.research-agent/config/models.json.
  agent-loop.js           The two modes:
                          - runLLMLoop()   shared streaming loop
                          - getOrchestratorPrompt() + agentConfigs + runSubAgent() for multi mode
                          - runAgentLoop() entrypoint that picks single vs multi
  llm-client.js           Native https streaming client. Handles proxy via tools/http-client.js.
                          Sends enable_thinking via top-level AND chat_template_kwargs.
  system-prompt.js        Single-mode system prompt with skill injection + web-search gating.
  sessions.js             ~/.research-agent/sessions/<id>.json read/write.
  confirmations.js        Tool-confirmation pending-request store. Resolved by /api/confirm/:id.
  tools/
    index.js              Tool registry. toolDefinitions[] (OpenAI tool schema) + toolHandlers{}.
    file-ops.js           read_file, write_file, list_files, display_image, validatePath().
    job-ops.js            submit_job, check_job (Slurm + PBS).
    command-ops.js        run_shell (login bash); BLOCKED_PATTERNS + DEFAULT_AUTO_APPROVE.
                          Captures USER_ENV from bash -lc 'env -0' at startup.
    web-search.js         SearXNG / Tavily / Serper / Bing backends.
    web-fetch.js          HTML -> readable text via dom-extraction.
    paper-search.js       OpenAlex search + abstract fetch.
    wos-search.js         Web of Science (requires RA_WOS_USERNAME/PASSWORD).
    http-client.js        Shared HTTP client. Auto-proxy via getProxy() / connectViaProxy().
  skills/
    index.js              Keyword-matched skill injection. listSkills() + getSkillPrompt().
    *.js                  Each skill is { name, keywords, promptContent }.
client/
  index.jsx               React entry; mounts <App />.
  App.jsx                 Top-level state, model dropdown, send loop, modal wiring.
  components/             ChatView, MessageBubble, ThinkingBlock, ToolCallBlock,
                          CodeBlock, FileBrowser, SessionSidebar, InputBar, ModelSettings.
  lib/
    sse.js                streamChat() — POST /api/chat, parse SSE events, retry on 403.
    api.js                apiFetch(), getCsrfToken(), refreshCsrfToken().
    i18n.js               en / zh-CN dicts, t(), runtime selector.
  styles.css              Single global stylesheet. Light/dark via [data-theme].
views/index.hbs           Handlebars wrapper; injects window.__RA__ (baseURI, csrfToken, branding).
public/dist/              Built frontend (gitignored).
```

## Build pipeline

The frontend is bundled by `esbuild` directly. There's no webpack, no Vite, no PostCSS. CSS is hand-written, not Tailwind. To pick up a JSX or CSS change:

```bash
npx esbuild client/index.jsx --bundle --outfile=public/dist/index.js --loader:.jsx=jsx
```

`esbuild` is fast enough that watch mode is rarely worth it; just re-run after each edit.

Server changes don't need a rebuild — Passenger picks them up on `touch tmp/restart.txt`. For local dev without Passenger, restart `node app.js`.

## Adding a tool

1. **Write the handler** in a file under `server/tools/`. It's an `async` function that takes a plain-JS object of arguments and returns either a string (sent to the LLM as the tool result) or a `{ needsConfirmation: true, command }` object for tools that gate on user approval.
2. **Register it** in `server/tools/index.js`:
   - Push an OpenAI tool definition (name, description, parameters schema) onto `toolDefinitions[]`.
   - Map the name to the handler in `toolHandlers{}`.
3. **Make it available to the right agent**:
   - Single mode picks up everything in `toolDefinitions` automatically.
   - Multi mode: add the tool name to `agentConfigs.files_and_compute.tools` (or whichever sub-agent) in `server/agent-loop.js`, and mention it in that agent's `buildSystemPrompt`.
4. **Optional client rendering**: if the tool's result wants special UI (like `display_image`'s inline image), special-case it in `components/ToolCallBlock.jsx` by name.

Good first reference: `display_image` is small and touches both server and client.

## Adding a skill

Skills are domain knowledge that's auto-injected into the system prompt when the conversation mentions certain keywords.

```js
// server/skills/my-skill.js
module.exports = {
  name: 'my-skill',
  description: 'Brief description shown in the available-skills list',
  keywords: ['mykeyword', 'another'],
  promptContent: `## My Skill

Detailed knowledge to inject when matched...`,
};
```

`server/skills/index.js` loads everything in the directory at boot. Matching is case-insensitive against the last 3 user messages.

## Adding a model backend

If your LLM API isn't OpenAI-compatible, the right hook is `server/llm-client.js`. It already handles:

- Streaming SSE with `data:`-prefixed JSON lines.
- Native `https.request` with optional CONNECT-tunnel via `http_proxy`.
- Both `delta.reasoning_content` and `delta.reasoning` shapes.
- `enable_thinking` via top-level and `chat_template_kwargs`.

If you need a different request body or response parser, add a branch on `modelConfig.endpoint` or a new `modelConfig.dialect` field.

## Agent modes

`server/agent-loop.js` exports a single `runAgentLoop(res, userMessages, modelId, options)`:

- **Single mode** (default, `RA_AGENT_MODE=single`): builds the system prompt via `getSystemPrompt()`, calls `runLLMLoop()` with `toolDefinitions` (filtered by `webSearch` flag), iterates LLM ↔ tool ↔ LLM until the model says it's done.
- **Multi mode** (`RA_AGENT_MODE=multi`): builds the orchestrator prompt via `getOrchestratorPrompt()`, gives the LLM only the three delegation tools (`files_and_compute`, `web_research`, `literature`), and when a delegation is called, `runSubAgent()` spins up a fresh `runLLMLoop()` with that sub-agent's scoped tool list. Sub-agents can use a different model via `RA_AGENT_MODEL_<NAME>`.

Both modes share the same `runLLMLoop`. Anything you teach `runLLMLoop` applies everywhere.

## CSRF flow

- Secret is stored at `~/.research-agent/csrf-secret` and survives Passenger restarts.
- HBS template injects the token into `window.__RA__.csrfToken`. Client sends it as `X-CSRF-Token` on every mutating request.
- `apiFetch` and `streamChat` retry once on 403 after fetching a fresh token from `GET /api/csrf`.

If you add a new mutating endpoint, attach the `csrfProtect` middleware.

## Session shape

```jsonc
{
  "id": "mo...",
  "title": "First 60 chars of the user prompt",
  "createdAt": 1715472000000,
  "updatedAt": 1715472240000,
  "messages": [
    { "role": "user", "content": "..." },
    {
      "role": "assistant",
      "content": "...",         // final text
      "reasoning": "...",       // combined reasoning stream
      "toolCalls": [{ "id": "...", "name": "read_file", "args": {...} }],
      "toolResults": { "<id>": { "result": "..." } },
      "parts": [                // ordered render sequence
        { "type": "reasoning", "content": "..." },
        { "type": "toolCall", "toolCall": {...}, "result": {...} },
        { "type": "content", "content": "..." }
      ]
    }
  ]
}
```

The `parts` array drives the in-order rendering in `MessageBubble`. `content`/`reasoning`/`toolCalls` are the legacy flat shapes for backwards-compat with older session files.

Bash-mode (`!`) messages carry `bang: true` and store the command output already wrapped in a fenced markdown code block.

## Code style

- No TypeScript. JavaScript everywhere, JSX in `client/`.
- No CSS preprocessors; one global `styles.css` with CSS custom properties for theming.
- No semicolons-vs-no-semicolons holy war — copy whatever the surrounding code does (which is: semicolons).
- Server modules use CommonJS (`require` / `module.exports`). Client uses ES modules (`import`).

## Testing

There's no automated test suite right now. Manual flow for a tool change:

1. `node app.js` locally with at least one model configured.
2. Use the app to trigger the tool; watch the SSE stream in the browser DevTools network tab if results look off.
3. For server-only logic, a small Node REPL test usually beats wiring up a test harness:
   ```bash
   node -e 'require("./server/tools/foo").handler({ ... }).then(console.log)'
   ```

## Releasing

There's no release process — `master` is what's deployed. The flow is:
1. Edit locally.
2. `rsync` to the dev OOD app.
3. Rebuild on the dev app.
4. Try it.
5. Promote dev → sys via `rsync -a --delete` and `touch tmp/restart.txt`.

See [DEPLOYMENT.md](DEPLOYMENT.md) for the exact commands.

## Useful entry points when debugging

- **"Model isn't reasoning"** — check `llm-client.js`; `enable_thinking` shape may not match the backend.
- **"Tool result shows garbled error"** — wrap the handler's call site in `agent-loop.js` to log args; check `validatePath` etc. for early throws.
- **"Streaming stops mid-response"** — open `~/.research-agent/sessions/<id>.json` and look at the last `assistant` message; partial parts tell you which channel (reasoning/content/toolCall) was last active.
- **"403 on every request"** — token cached from a previous server, refresh the page, or check `~/.research-agent/csrf-secret` exists.
