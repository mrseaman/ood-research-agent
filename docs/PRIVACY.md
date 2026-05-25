# Privacy: what the Research Agent logs

This document describes the usage telemetry that the Research Agent writes to
each user's home directory. **No conversation content is logged** — only
metadata for capacity planning, cost tracking, and error monitoring.

## Storage location

```
~/.research-agent/usage/YYYY-MM-DD.jsonl
```

Files are owned by the user (the Passenger app runs as them). One JSONL line
per event. New file per UTC day. Files are not rotated by default; set
`RA_USAGE_RETENTION_DAYS=N` to prune files older than N days on app startup.

## Event types and fields

| Event | Fields |
|---|---|
| `message_sent` | `ts`, `session_id`, `model` |
| `llm_response` | `ts`, `session_id`, `model`, `agent`, `tokens_in`, `tokens_out`, `duration_ms` |
| `tool_call` | `ts`, `session_id`, `tool`, `ok`, `agent` |
| `error` | `ts`, `session_id`, `model`, `agent`, `kind` (`llm_error`/`tool_error`/`timeout`), `duration_ms` |
| `aborted` | `ts`, `session_id`, `model` |

`session_id` is the opaque slug the client generates; it appears in
`~/.research-agent/sessions/<id>.json` (the conversation transcript), which has
the same per-user file ownership as the usage log.

## What is **not** logged

- Message text (user prompts, assistant replies, reasoning, tool output)
- Tool arguments (e.g., file paths, shell commands, search queries, URLs)
- File contents
- Environment variables or secrets

## Who can read it

- The user themselves (the files are in their `$HOME`).
- The system administrator, who can read all users' homes as root for
  aggregation via `bin/usage-report.js`.

## How to disable

Remove the `~/.research-agent/usage/` directory after stopping the app, or set
`RA_USAGE_RETENTION_DAYS=1` to keep only a single day at a time. There is no
runtime kill-switch — the logging is unconditional metadata for operational
observability.
