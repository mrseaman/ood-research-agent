'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const USAGE_DIR = path.join(os.homedir(), '.research-agent', 'usage');

let cachedFd = null;
let cachedDate = null;

function ensureDir() {
  try { fs.mkdirSync(USAGE_DIR, { recursive: true }); } catch {}
}

function todayStr() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fileForDate(dateStr) {
  return path.join(USAGE_DIR, `${dateStr}.jsonl`);
}

/**
 * Append a usage event. Synchronous (fast O_APPEND write), fire-and-forget.
 * Never throws — logging must not break the request flow.
 *
 * Event shape (only `event` is required; others optional):
 *   { event, session_id?, model?, agent?, tokens_in?, tokens_out?,
 *     duration_ms?, tool?, ok?, kind? }
 * `ts` is added automatically.
 */
function logEvent(event) {
  try {
    ensureDir();
    const date = todayStr();
    if (cachedDate !== date && cachedFd !== null) {
      try { fs.closeSync(cachedFd); } catch {}
      cachedFd = null;
    }
    cachedDate = date;
    if (cachedFd === null) {
      cachedFd = fs.openSync(fileForDate(date), 'a');
    }
    const record = { ts: new Date().toISOString(), ...event };
    fs.writeSync(cachedFd, JSON.stringify(record) + '\n');
  } catch {
    // logging must never break the request — but try a one-shot reopen next call
    try { if (cachedFd !== null) fs.closeSync(cachedFd); } catch {}
    cachedFd = null;
  }
}

function listDateFiles() {
  ensureDir();
  return fs.readdirSync(USAGE_DIR)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
    .sort();
}

function readEventsInRange(fromDate, toDate, filter = null) {
  const events = [];
  for (const f of listDateFiles()) {
    const date = f.slice(0, 10);
    if (date < fromDate || date > toDate) continue;
    let content;
    try {
      content = fs.readFileSync(path.join(USAGE_DIR, f), 'utf8');
    } catch { continue; }
    for (const line of content.split('\n')) {
      if (!line) continue;
      try {
        const ev = JSON.parse(line);
        if (filter && !filter(ev)) continue;
        events.push(ev);
      } catch {}
    }
  }
  return events;
}

function shiftDate(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function ymd(date) {
  return new Date(date).toISOString().slice(0, 10);
}

/**
 * Aggregate usage over the last `days` days (inclusive of today).
 * Optionally filter to a single sessionId.
 *
 * pricing is { [model]: { input: usdPerMillion, output: usdPerMillion } }
 */
function aggregate({ days = 30, sessionId = null, pricing = {} } = {}) {
  const today = todayStr();
  const from = shiftDate(today, -(days - 1));
  const filter = sessionId ? (ev => ev.session_id === sessionId) : null;
  const events = readEventsInRange(from, today, filter);

  // Build day list
  const dayList = [];
  for (let i = 0; i < days; i++) dayList.push(shiftDate(from, i));

  const msgPerDay = Object.fromEntries(dayList.map(d => [d, 0]));
  const tokensByDayModel = {}; // day -> model -> {in, out}
  const tokensByModel = {};    // model -> {in, out}
  const toolMix = {};
  const errorsByKind = {};
  let totalAborts = 0;
  let totalErrors = 0;
  let totalLlmResponses = 0;
  const tokensByAgent = {};

  for (const ev of events) {
    const day = ymd(ev.ts);
    switch (ev.event) {
      case 'message_sent':
        if (msgPerDay[day] !== undefined) msgPerDay[day]++;
        break;
      case 'llm_response': {
        totalLlmResponses++;
        const model = ev.model || 'unknown';
        const inn = ev.tokens_in || 0;
        const out = ev.tokens_out || 0;
        if (!tokensByDayModel[day]) tokensByDayModel[day] = {};
        if (!tokensByDayModel[day][model]) tokensByDayModel[day][model] = { in: 0, out: 0 };
        tokensByDayModel[day][model].in += inn;
        tokensByDayModel[day][model].out += out;
        if (!tokensByModel[model]) tokensByModel[model] = { in: 0, out: 0 };
        tokensByModel[model].in += inn;
        tokensByModel[model].out += out;
        const ag = ev.agent || 'single';
        if (!tokensByAgent[ag]) tokensByAgent[ag] = { in: 0, out: 0 };
        tokensByAgent[ag].in += inn;
        tokensByAgent[ag].out += out;
        break;
      }
      case 'tool_call':
        if (ev.tool) toolMix[ev.tool] = (toolMix[ev.tool] || 0) + 1;
        break;
      case 'error': {
        totalErrors++;
        const k = ev.kind || 'unknown';
        errorsByKind[k] = (errorsByKind[k] || 0) + 1;
        break;
      }
      case 'aborted':
        totalAborts++;
        break;
    }
  }

  // Cost
  function costFor(model, inn, out) {
    const p = pricing[model];
    if (!p) return 0;
    return (inn / 1e6) * (p.input || 0) + (out / 1e6) * (p.output || 0);
  }
  const costByModel = {};
  let totalCost = 0;
  let totalIn = 0, totalOut = 0;
  for (const [m, t] of Object.entries(tokensByModel)) {
    const c = costFor(m, t.in, t.out);
    costByModel[m] = { in: t.in, out: t.out, cost: c };
    totalCost += c;
    totalIn += t.in;
    totalOut += t.out;
  }

  return {
    range: { from, to: today, days },
    sessionId,
    messagesPerDay: dayList.map(d => ({ date: d, count: msgPerDay[d] })),
    totalMessages: Object.values(msgPerDay).reduce((a, b) => a + b, 0),
    tokensPerDayPerModel: (() => {
      const rows = [];
      for (const d of dayList) {
        const dayData = tokensByDayModel[d] || {};
        for (const [m, t] of Object.entries(dayData)) {
          rows.push({ date: d, model: m, in: t.in, out: t.out });
        }
      }
      return rows;
    })(),
    tokensByModel: Object.entries(tokensByModel).map(([model, t]) => ({ model, in: t.in, out: t.out })),
    totalTokensIn: totalIn,
    totalTokensOut: totalOut,
    toolMix: Object.entries(toolMix).map(([tool, count]) => ({ tool, count })).sort((a, b) => b.count - a.count),
    errors: {
      total: totalErrors,
      rate: totalLlmResponses + totalErrors > 0
        ? totalErrors / (totalLlmResponses + totalErrors)
        : 0,
      byKind: Object.entries(errorsByKind).map(([kind, count]) => ({ kind, count })),
    },
    aborts: totalAborts,
    cost: {
      total: totalCost,
      byModel: Object.entries(costByModel).map(([model, c]) => ({ model, ...c })),
    },
    tokensByAgent: Object.entries(tokensByAgent).map(([agent, t]) => ({ agent, in: t.in, out: t.out })),
  };
}

/**
 * Aggregate stats for a single session — used by the session-info panel.
 */
function sessionStats(sessionId, pricing = {}) {
  // Scan all files (sessions typically span 1-2 days; scan all is cheap)
  const files = listDateFiles();
  if (files.length === 0) return null;
  const fromDate = files[0].slice(0, 10);
  const toDate = files[files.length - 1].slice(0, 10);
  const events = readEventsInRange(fromDate, toDate, ev => ev.session_id === sessionId);
  if (events.length === 0) return null;

  const tokensByModel = {};
  const toolMix = {};
  let messages = 0;
  let errors = 0;
  let aborts = 0;
  let firstTs = null, lastTs = null;
  const tokensByAgent = {};

  for (const ev of events) {
    if (!firstTs || ev.ts < firstTs) firstTs = ev.ts;
    if (!lastTs || ev.ts > lastTs) lastTs = ev.ts;
    switch (ev.event) {
      case 'message_sent': messages++; break;
      case 'llm_response': {
        const m = ev.model || 'unknown';
        if (!tokensByModel[m]) tokensByModel[m] = { in: 0, out: 0 };
        tokensByModel[m].in += ev.tokens_in || 0;
        tokensByModel[m].out += ev.tokens_out || 0;
        const ag = ev.agent || 'single';
        if (!tokensByAgent[ag]) tokensByAgent[ag] = { in: 0, out: 0 };
        tokensByAgent[ag].in += ev.tokens_in || 0;
        tokensByAgent[ag].out += ev.tokens_out || 0;
        break;
      }
      case 'tool_call':
        if (ev.tool) toolMix[ev.tool] = (toolMix[ev.tool] || 0) + 1;
        break;
      case 'error': errors++; break;
      case 'aborted': aborts++; break;
    }
  }

  let totalCost = 0, totalIn = 0, totalOut = 0;
  const byModel = [];
  for (const [model, t] of Object.entries(tokensByModel)) {
    const p = pricing[model];
    const cost = p ? (t.in / 1e6) * (p.input || 0) + (t.out / 1e6) * (p.output || 0) : 0;
    byModel.push({ model, in: t.in, out: t.out, cost });
    totalCost += cost;
    totalIn += t.in;
    totalOut += t.out;
  }

  return {
    sessionId,
    firstTs,
    lastTs,
    messages,
    errors,
    aborts,
    tokensIn: totalIn,
    tokensOut: totalOut,
    cost: totalCost,
    byModel,
    toolMix: Object.entries(toolMix).map(([tool, count]) => ({ tool, count })).sort((a, b) => b.count - a.count),
    byAgent: Object.entries(tokensByAgent).map(([agent, t]) => ({ agent, in: t.in, out: t.out })),
  };
}

/**
 * Delete usage files older than `retentionDays`. No-op if retentionDays is null/undefined.
 */
function pruneOld(retentionDays) {
  if (!retentionDays || retentionDays <= 0) return;
  const cutoff = shiftDate(todayStr(), -retentionDays);
  for (const f of listDateFiles()) {
    const date = f.slice(0, 10);
    if (date < cutoff) {
      try { fs.unlinkSync(path.join(USAGE_DIR, f)); } catch {}
    }
  }
}

module.exports = {
  logEvent,
  aggregate,
  sessionStats,
  pruneOld,
  USAGE_DIR,
};
