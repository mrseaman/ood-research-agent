'use strict';

const { URL } = require('url');
const { httpRequest } = require('./http-client');

/**
 * Search the web using a configurable backend.
 *
 * Supported backends (set via RA_SEARCH_ENGINE env var):
 *   - "searxng"  : Self-hosted SearXNG instance (default)
 *   - "tavily"   : Tavily Search API (1000 free searches/month)
 *   - "serper"   : Serper.dev Google Search API
 *   - "bing"     : Bing Web Search API (Azure AI)
 *
 * Env vars:
 *   RA_SEARCH_ENGINE   — backend type (default: "searxng")
 *   RA_SEARCH_ENDPOINT — base URL (default: http://localhost:8888, only for searxng)
 *   RA_SEARCH_API_KEY  — API key (required for tavily/serper/bing, not for searxng)
 */

const SEARCH_ENGINE = process.env.RA_SEARCH_ENGINE || 'searxng';
const SEARCH_ENDPOINT = process.env.RA_SEARCH_ENDPOINT || 'http://localhost:8888';
const SEARCH_API_KEY = process.env.RA_SEARCH_API_KEY || '';

function detectChinese(text) {
  return /[\u4e00-\u9fff]/.test(text);
}

async function searchSearXNG(query, numResults) {
  // Use multiple engines for redundancy (some may get CAPTCHA-suspended)
  // Chinese: bing + sogou + quark; English: bing + yandex + quark
  const engines = detectChinese(query) ? 'bing,sogou,quark' : 'bing,yandex,quark';
  const url = `${SEARCH_ENDPOINT}/search?q=${encodeURIComponent(query)}&format=json&engines=${engines}&pageno=1`;
  const raw = await httpRequest(url);
  const data = JSON.parse(raw);
  const allResults = data.results || [];

  // Deduplicate by hostname+pathname, keep the one with higher score
  const seen = new Map();
  for (const r of allResults) {
    try {
      const u = new URL(r.url);
      const key = u.hostname + u.pathname;
      const existing = seen.get(key);
      if (!existing || (r.score || 0) > (existing.score || 0)) {
        seen.set(key, r);
      }
    } catch {
      seen.set(r.url, r);
    }
  }

  return Array.from(seen.values())
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, numResults)
    .map(r => ({
      title: r.title,
      url: r.url,
      snippet: r.content || '',
    }));
}

async function searchTavily(query, numResults) {
  const url = 'https://api.tavily.com/search';
  const raw = await httpRequest(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SEARCH_API_KEY}`,
    },
    body: JSON.stringify({
      query,
      max_results: numResults,
      search_depth: 'basic',
    }),
  });
  const data = JSON.parse(raw);
  const results = (data.results || []).slice(0, numResults);
  return results.map(r => ({
    title: r.title,
    url: r.url,
    snippet: r.content || '',
  }));
}

async function searchSerper(query, numResults) {
  const url = 'https://google.serper.dev/search';
  const raw = await httpRequest(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': SEARCH_API_KEY,
    },
    body: JSON.stringify({ q: query, num: numResults }),
  });
  const data = JSON.parse(raw);
  const results = (data.organic || []).slice(0, numResults);
  return results.map(r => ({
    title: r.title,
    url: r.link,
    snippet: r.snippet || '',
  }));
}

async function searchBing(query, numResults) {
  const url = `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}&count=${numResults}`;
  const raw = await httpRequest(url, {
    headers: { 'Ocp-Apim-Subscription-Key': SEARCH_API_KEY },
  });
  const data = JSON.parse(raw);
  const results = (data.webPages?.value || []).slice(0, numResults);
  return results.map(r => ({
    title: r.name,
    url: r.url,
    snippet: r.snippet || '',
  }));
}

async function webSearch({ query, num_results }) {
  const numResults = Math.min(num_results || 10, 20);

  if (!query || !query.trim()) {
    throw new Error('Search query is required');
  }

  let results;
  switch (SEARCH_ENGINE) {
    case 'tavily':
      results = await searchTavily(query, numResults);
      break;
    case 'serper':
      results = await searchSerper(query, numResults);
      break;
    case 'bing':
      results = await searchBing(query, numResults);
      break;
    case 'searxng':
    default:
      results = await searchSearXNG(query, numResults);
      break;
  }

  if (results.length === 0) {
    return 'No results found.';
  }

  return results.map((r, i) =>
    `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.snippet}`
  ).join('\n\n');
}

module.exports = { webSearch };
