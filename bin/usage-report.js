#!/usr/bin/env node
'use strict';

/**
 * Research Agent usage report.
 *
 * Walks /home/<user>/.research-agent/usage/*.jsonl across all users (run as root)
 * and produces an aggregated report.
 *
 * Usage:
 *   sudo node bin/usage-report.js [--from YYYY-MM-DD] [--to YYYY-MM-DD]
 *                                 [--user <name>] [--out html|json|text]
 *                                 [--pricing path/to/pricing.json]
 *                                 [--home-base /home]
 *                                 [--output-file path]
 *
 * Pricing JSON shape:
 *   { "deepseek": { "input": 0.27, "output": 1.10 }, ... }
 *   (USD per 1M tokens)
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_PRICING_PATH = '/etc/ood/config/apps/research-agent/pricing.json';

function parseArgs(argv) {
  const opts = {
    from: null,
    to: null,
    user: null,
    out: 'text',
    pricing: DEFAULT_PRICING_PATH,
    homeBase: '/home',
    outputFile: null,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const v = argv[i + 1];
    switch (a) {
      case '--from': opts.from = v; i++; break;
      case '--to': opts.to = v; i++; break;
      case '--user': opts.user = v; i++; break;
      case '--out': opts.out = v; i++; break;
      case '--pricing': opts.pricing = v; i++; break;
      case '--home-base': opts.homeBase = v; i++; break;
      case '--output-file': opts.outputFile = v; i++; break;
      case '-h':
      case '--help':
        console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(2, 22).map(l => l.replace(/^ \* ?/, '')).join('\n'));
        process.exit(0);
    }
  }
  return opts;
}

function loadPricing(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.warn(`Could not read pricing file ${filePath}: ${err.message}. Costs will be $0.`);
    return {};
  }
}

function listUsers(homeBase, filterUser) {
  let entries;
  try {
    entries = fs.readdirSync(homeBase, { withFileTypes: true });
  } catch (err) {
    console.error(`Cannot read ${homeBase}: ${err.message}`);
    process.exit(1);
  }
  return entries
    .filter(e => e.isDirectory())
    .map(e => e.name)
    .filter(name => !filterUser || name === filterUser);
}

function todayStr() { return new Date().toISOString().slice(0, 10); }
function shiftDate(d, days) {
  const dt = new Date(`${d}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function readUserEvents(usageDir, fromDate, toDate) {
  let files;
  try {
    files = fs.readdirSync(usageDir).filter(f => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f));
  } catch { return []; }
  const events = [];
  for (const f of files) {
    const date = f.slice(0, 10);
    if (fromDate && date < fromDate) continue;
    if (toDate && date > toDate) continue;
    let content;
    try { content = fs.readFileSync(path.join(usageDir, f), 'utf8'); }
    catch { continue; }
    for (const line of content.split('\n')) {
      if (!line) continue;
      try { events.push(JSON.parse(line)); } catch {}
    }
  }
  return events;
}

function newStats() {
  return {
    messages: 0,
    llmResponses: 0,
    errors: 0,
    aborts: 0,
    tokensIn: 0,
    tokensOut: 0,
    cost: 0,
    byModel: {},     // model -> {in, out, cost}
    byTool: {},      // tool -> count
    byErrorKind: {}, // kind -> count
    byAgent: {},     // agent -> {in, out}
    days: new Set(),
    firstTs: null,
    lastTs: null,
  };
}

function applyEvent(stats, ev, pricing) {
  if (ev.ts) {
    const d = ev.ts.slice(0, 10);
    stats.days.add(d);
    if (!stats.firstTs || ev.ts < stats.firstTs) stats.firstTs = ev.ts;
    if (!stats.lastTs || ev.ts > stats.lastTs) stats.lastTs = ev.ts;
  }
  switch (ev.event) {
    case 'message_sent': stats.messages++; break;
    case 'llm_response': {
      stats.llmResponses++;
      const m = ev.model || 'unknown';
      const inn = ev.tokens_in || 0;
      const out = ev.tokens_out || 0;
      stats.tokensIn += inn;
      stats.tokensOut += out;
      if (!stats.byModel[m]) stats.byModel[m] = { in: 0, out: 0, cost: 0 };
      stats.byModel[m].in += inn;
      stats.byModel[m].out += out;
      const p = pricing[m];
      if (p) {
        const cost = (inn / 1e6) * (p.input || 0) + (out / 1e6) * (p.output || 0);
        stats.byModel[m].cost += cost;
        stats.cost += cost;
      }
      const ag = ev.agent || 'single';
      if (!stats.byAgent[ag]) stats.byAgent[ag] = { in: 0, out: 0 };
      stats.byAgent[ag].in += inn;
      stats.byAgent[ag].out += out;
      break;
    }
    case 'tool_call':
      if (ev.tool) stats.byTool[ev.tool] = (stats.byTool[ev.tool] || 0) + 1;
      break;
    case 'error': {
      stats.errors++;
      const k = ev.kind || 'unknown';
      stats.byErrorKind[k] = (stats.byErrorKind[k] || 0) + 1;
      break;
    }
    case 'aborted': stats.aborts++; break;
  }
}

function fmtNum(n) {
  if (!n) return '0';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  return String(n);
}
function fmtCost(c) {
  if (!c) return '$0.00';
  if (c < 0.01) return '<$0.01';
  return '$' + c.toFixed(2);
}

function renderText(report) {
  const lines = [];
  lines.push(`Research Agent — usage report`);
  lines.push(`Range: ${report.from || 'all'} → ${report.to || 'all'}`);
  lines.push(`Users: ${report.users.length}    Total messages: ${report.total.messages}    ` +
    `Tokens: ${fmtNum(report.total.tokensIn + report.total.tokensOut)} (${fmtNum(report.total.tokensIn)} in / ${fmtNum(report.total.tokensOut)} out)    ` +
    `Cost: ${fmtCost(report.total.cost)}    Errors: ${report.total.errors}    Aborts: ${report.total.aborts}`);
  lines.push('');
  lines.push('Per-user:');
  lines.push('  USER                MSGS   TOK_IN    TOK_OUT   COST       ERR  ABRT  ACTIVE_DAYS');
  for (const u of report.users) {
    lines.push(
      '  ' + u.user.padEnd(20) +
      String(u.stats.messages).padStart(5) + '  ' +
      fmtNum(u.stats.tokensIn).padStart(8) + '  ' +
      fmtNum(u.stats.tokensOut).padStart(8) + '  ' +
      fmtCost(u.stats.cost).padStart(9) + '  ' +
      String(u.stats.errors).padStart(4) + '  ' +
      String(u.stats.aborts).padStart(4) + '  ' +
      String(u.stats.days.size).padStart(11)
    );
  }
  lines.push('');
  lines.push('Tokens by model (all users):');
  for (const [m, t] of Object.entries(report.total.byModel)) {
    lines.push(`  ${m.padEnd(24)} in=${fmtNum(t.in).padStart(8)} out=${fmtNum(t.out).padStart(8)} cost=${fmtCost(t.cost)}`);
  }
  lines.push('');
  lines.push('Tool usage (all users):');
  const tools = Object.entries(report.total.byTool).sort((a, b) => b[1] - a[1]);
  for (const [tool, count] of tools) {
    lines.push(`  ${tool.padEnd(24)} ${count}`);
  }
  if (Object.keys(report.total.byErrorKind).length) {
    lines.push('');
    lines.push('Errors by kind:');
    for (const [k, n] of Object.entries(report.total.byErrorKind)) {
      lines.push(`  ${k.padEnd(20)} ${n}`);
    }
  }
  return lines.join('\n');
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function renderHtml(report) {
  const userRows = report.users.map(u => `
    <tr>
      <td>${esc(u.user)}</td>
      <td class="num">${u.stats.messages}</td>
      <td class="num">${fmtNum(u.stats.tokensIn)}</td>
      <td class="num">${fmtNum(u.stats.tokensOut)}</td>
      <td class="num">${fmtCost(u.stats.cost)}</td>
      <td class="num">${u.stats.errors}</td>
      <td class="num">${u.stats.aborts}</td>
      <td class="num">${u.stats.days.size}</td>
      <td class="num">${Object.entries(u.stats.byTool).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t, c]) => `${esc(t)}:${c}`).join(', ')}</td>
    </tr>
  `).join('');
  const modelRows = Object.entries(report.total.byModel).map(([m, t]) => `
    <tr><td>${esc(m)}</td><td class="num">${fmtNum(t.in)}</td><td class="num">${fmtNum(t.out)}</td><td class="num">${fmtCost(t.cost)}</td></tr>
  `).join('');
  const toolRows = Object.entries(report.total.byTool).sort((a, b) => b[1] - a[1]).map(([t, c]) =>
    `<tr><td>${esc(t)}</td><td class="num">${c}</td></tr>`
  ).join('');
  const errorRows = Object.entries(report.total.byErrorKind).map(([k, n]) =>
    `<tr><td>${esc(k)}</td><td class="num">${n}</td></tr>`
  ).join('') || '<tr><td colspan="2" class="muted">no errors</td></tr>';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Research Agent usage report</title>
<style>
  body { font: 14px/1.5 -apple-system, system-ui, sans-serif; max-width: 1100px; margin: 32px auto; padding: 0 20px; color: #1a1a1a; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.06em; color: #666; margin: 28px 0 8px; }
  .meta { color: #666; margin-bottom: 24px; }
  .cards { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; margin-bottom: 20px; }
  .card { background: #f5f6f8; border-radius: 6px; padding: 10px 12px; }
  .card .lbl { font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 0.04em; }
  .card .val { font-size: 18px; font-weight: 600; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 8px; }
  th, td { padding: 6px 10px; border-bottom: 1px solid #e6e6e6; text-align: left; }
  th { font-weight: 500; color: #666; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  tr:hover { background: #fafafa; }
  .muted { color: #999; }
  .footer { margin-top: 40px; color: #888; font-size: 12px; }
</style></head>
<body>
  <h1>Research Agent — usage report</h1>
  <div class="meta">Range: ${esc(report.from || 'all')} → ${esc(report.to || 'all')}    Generated: ${new Date().toISOString()}</div>

  <div class="cards">
    <div class="card"><div class="lbl">Users</div><div class="val">${report.users.length}</div></div>
    <div class="card"><div class="lbl">Messages</div><div class="val">${report.total.messages}</div></div>
    <div class="card"><div class="lbl">Tokens in</div><div class="val">${fmtNum(report.total.tokensIn)}</div></div>
    <div class="card"><div class="lbl">Tokens out</div><div class="val">${fmtNum(report.total.tokensOut)}</div></div>
    <div class="card"><div class="lbl">Cost</div><div class="val">${fmtCost(report.total.cost)}</div></div>
    <div class="card"><div class="lbl">Errors / aborts</div><div class="val">${report.total.errors} / ${report.total.aborts}</div></div>
  </div>

  <h2>Per user</h2>
  <table>
    <thead><tr><th>User</th><th class="num">Msgs</th><th class="num">Tok in</th><th class="num">Tok out</th><th class="num">Cost</th><th class="num">Err</th><th class="num">Abrt</th><th class="num">Days</th><th>Top tools</th></tr></thead>
    <tbody>${userRows || '<tr><td colspan="9" class="muted">no usage</td></tr>'}</tbody>
  </table>

  <h2>By model</h2>
  <table>
    <thead><tr><th>Model</th><th class="num">Tokens in</th><th class="num">Tokens out</th><th class="num">Cost</th></tr></thead>
    <tbody>${modelRows || '<tr><td colspan="4" class="muted">no data</td></tr>'}</tbody>
  </table>

  <h2>Tool usage</h2>
  <table>
    <thead><tr><th>Tool</th><th class="num">Calls</th></tr></thead>
    <tbody>${toolRows || '<tr><td colspan="2" class="muted">no data</td></tr>'}</tbody>
  </table>

  <h2>Errors by kind</h2>
  <table>
    <thead><tr><th>Kind</th><th class="num">Count</th></tr></thead>
    <tbody>${errorRows}</tbody>
  </table>

  <div class="footer">Source: research-agent usage logs (~/.research-agent/usage/*.jsonl). Metadata only — no message content is logged.</div>
</body></html>`;
}

function main() {
  const opts = parseArgs(process.argv);
  const pricing = loadPricing(opts.pricing);
  const users = listUsers(opts.homeBase, opts.user);

  const total = newStats();
  const perUser = [];

  for (const user of users) {
    const usageDir = path.join(opts.homeBase, user, '.research-agent', 'usage');
    if (!fs.existsSync(usageDir)) continue;
    const events = readUserEvents(usageDir, opts.from, opts.to);
    if (events.length === 0) continue;
    const stats = newStats();
    for (const ev of events) {
      applyEvent(stats, ev, pricing);
      applyEvent(total, ev, pricing);
    }
    perUser.push({ user, stats });
  }

  perUser.sort((a, b) => b.stats.cost - a.stats.cost || b.stats.messages - a.stats.messages);

  const report = { from: opts.from, to: opts.to, users: perUser, total };

  let out;
  switch (opts.out) {
    case 'json':
      out = JSON.stringify(report, (k, v) => v instanceof Set ? Array.from(v) : v, 2);
      break;
    case 'html':
      out = renderHtml(report);
      break;
    default:
      out = renderText(report);
  }

  if (opts.outputFile) {
    fs.writeFileSync(opts.outputFile, out);
    console.error(`Wrote ${opts.outputFile}`);
  } else {
    process.stdout.write(out + '\n');
  }
}

main();
