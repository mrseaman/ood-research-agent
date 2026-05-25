# Admin usage report

`bin/usage-report.js` aggregates per-user usage logs (see
[PRIVACY.md](PRIVACY.md) for what's collected) into a per-user / org-wide
report.

## One-shot

```bash
sudo node /var/www/ood/apps/sys/research-agent/bin/usage-report.js \
  --from 2026-05-01 --to 2026-05-31 \
  --pricing /etc/ood/config/apps/research-agent/pricing.json \
  --out html \
  --output-file /var/www/html/reports/research-agent-2026-05.html
```

Outputs:
- `text` (default): pretty-printed terminal table.
- `json`: machine-readable, suitable for further processing.
- `html`: self-contained single-file dashboard.

## Pricing file

`/etc/ood/config/apps/research-agent/pricing.json` (path overridable with
`--pricing`):

```json
{
  "deepseek": { "input": 0.27, "output": 1.10 },
  "qwen3-32b": { "input": 0.0, "output": 0.0 }
}
```

Values are **USD per 1 million tokens**. Missing models cost $0. Editing the
file does not require restarting the app — costs are computed at report time.

A starter file ships at `pricing.json.example` in the repo root.

## Flags

| Flag | Default | Notes |
|---|---|---|
| `--from YYYY-MM-DD` | all | Earliest day to include |
| `--to YYYY-MM-DD` | all | Latest day to include (inclusive) |
| `--user <name>` | all | Restrict to one user |
| `--out text\|json\|html` | text | Output format |
| `--pricing PATH` | `/etc/ood/.../pricing.json` | Pricing JSON file |
| `--home-base PATH` | `/home` | Where user homes live (some clusters use `/users`) |
| `--output-file PATH` | stdout | Write to file instead of stdout |

## Scheduled monthly report

```cron
# /etc/cron.d/research-agent-report
0 1 1 * * root /usr/bin/node /var/www/ood/apps/sys/research-agent/bin/usage-report.js \
  --from $(date -d "last month" +\%Y-\%m-01) \
  --to   $(date -d "last month +1 month -1 day" +\%Y-\%m-\%d) \
  --pricing /etc/ood/config/apps/research-agent/pricing.json \
  --out html \
  --output-file /var/www/html/reports/research-agent-$(date -d "last month" +\%Y-\%m).html
```

## How users see their own data

Each user can open Settings → Usage to see their own messages-per-day, tokens
per model, tool mix, and cost (using per-process `RA_MODEL_*_COST_*` env vars).
The session-info button at the top-right of the chat opens a per-session
breakdown for the currently-loaded conversation.
