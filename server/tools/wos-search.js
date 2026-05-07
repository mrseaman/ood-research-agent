'use strict';

const { httpRequest } = require('./http-client');
const { getWosSID, invalidateSID } = require('./wos-auth');

/**
 * Search academic papers via Web of Science internal API.
 *
 * Auth: auto-login via RA_WOS_USERNAME/RA_WOS_PASSWORD,
 * or use a pre-set RA_WOS_SID. Re-authenticates on session expiry.
 */

const WOS_API = 'https://www.webofscience.com/api/wosnx/core/runQuerySearch';

// Note: the general_semantic search mode only supports 'relevance' sort.
// Other sort values require a different search mode / payload format.
const SORT_MAP = {
  relevance: 'relevance',
};

// WoS field prefixes that indicate the query is already in WoS syntax
const WOS_FIELD_PREFIXES = /^(TS|AU|TI|OG|OG_SMART|SO|DO|PY|SU|FT|CF|AD|AI|IS|UT)=/i;

/**
 * Strip HTML tags from a string.
 */
function stripHtml(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ').trim();
}

/**
 * Convert a query to WoS search syntax if it's natural language.
 * If the query already contains a WoS field prefix, use it as-is.
 */
function toWosQuery(query) {
  const trimmed = query.trim();
  if (WOS_FIELD_PREFIXES.test(trimmed)) {
    return trimmed;
  }
  // Wrap natural language query in TS=(...)
  return `TS=(${trimmed})`;
}

/**
 * Execute the WoS search API call with a given SID.
 * Returns the raw response string.
 */
async function doWosSearch(sid, wosQuery, resultCount, sortKey, first = 1) {
  const url = `${WOS_API}?SID=${encodeURIComponent(sid)}`;

  const body = JSON.stringify({
    product: 'WOSCC',
    searchMode: 'general_semantic',
    viewType: 'search',
    serviceMode: 'summary',
    search: {
      mode: 'general_semantic',
      database: 'WOSCC',
      disableEdit: false,
      query: [{ rowText: wosQuery }],
      blending: 'blended',
      count: 100,
    },
    retrieve: {
      count: resultCount,
      first,
      history: true,
      jcr: true,
      sort: sortKey,
      analyzes: [],
      locale: 'en',
    },
    eventMode: null,
  });

  return await httpRequest(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=UTF-8',
      'Accept': 'application/x-ndjson',
    },
    body,
    timeout: 30000,
  });
}

/**
 * Parse WoS ndjson response into structured data.
 */
function parseResponse(raw) {
  const lines = raw.split('\n').filter(line => line.trim());
  let searchInfo = null;
  let records = null;
  let jcr = null;
  let error = null;

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed.key === 'searchInfo') {
        searchInfo = parsed.payload;
      } else if (parsed.key === 'records') {
        records = parsed.payload;
      } else if (parsed.key === 'jcr') {
        jcr = parsed.payload;
      } else if (parsed.key === 'error') {
        error = parsed.payload;
      }
    } catch {
      // Skip malformed lines
    }
  }

  return { searchInfo, records, jcr, error };
}

/**
 * Check if the response indicates a session error.
 */
function isSessionError(parsed) {
  if (!parsed.error) return false;
  const errStr = JSON.stringify(parsed.error);
  return errStr.includes('sessionNotFound') || errStr.includes('Session');
}

/**
 * Fetch a single page from WoS with session retry on expiry.
 * Returns { parsed, sid } so the caller can reuse the (possibly refreshed) SID.
 */
async function fetchWosPage(sid, wosQuery, pageSize, sortKey, first) {
  let raw = await doWosSearch(sid, wosQuery, pageSize, sortKey, first);
  let parsed = parseResponse(raw);

  if (isSessionError(parsed)) {
    invalidateSID();
    sid = await getWosSID();
    raw = await doWosSearch(sid, wosQuery, pageSize, sortKey, first);
    parsed = parseResponse(raw);
  }

  return { parsed, sid };
}

async function searchWoS({ query, count, sort }) {
  if (!query || !query.trim()) {
    throw new Error('Search query is required');
  }

  const resultCount = Math.min(Math.max(count || 10, 1), 50);
  const sortKey = SORT_MAP[sort] || SORT_MAP.relevance;
  const wosQuery = toWosQuery(query);

  const PAGE_SIZE = 20; // WoS max per request

  // Get SID (cached or fresh login)
  let sid = await getWosSID();

  // First page
  let result = await fetchWosPage(sid, wosQuery, Math.min(resultCount, PAGE_SIZE), sortKey, 1);
  sid = result.sid;
  let parsed = result.parsed;

  if (parsed.error) {
    throw new Error(`WoS API error: ${JSON.stringify(parsed.error)}`);
  }

  const totalFound = parsed.searchInfo?.RecordsFound || 0;

  if (!parsed.records || Object.keys(parsed.records).length === 0) {
    return `No papers found for query: ${wosQuery} (Total: ${totalFound})`;
  }

  // Merge records and jcr from all pages
  let allRecords = { ...parsed.records };
  let allJcr = { ...(parsed.jcr || {}) };

  // Fetch additional pages if needed
  let fetched = Object.keys(allRecords).length;
  while (fetched < resultCount && fetched < totalFound) {
    const first = fetched + 1;
    const remaining = resultCount - fetched;
    const pageSize = Math.min(remaining, PAGE_SIZE);

    result = await fetchWosPage(sid, wosQuery, pageSize, sortKey, first);
    sid = result.sid;
    const page = result.parsed;

    if (page.error || !page.records || Object.keys(page.records).length === 0) break;

    Object.assign(allRecords, page.records);
    if (page.jcr) Object.assign(allJcr, page.jcr);
    fetched = Object.keys(allRecords).length;
  }

  const records = allRecords;
  const jcr = allJcr;
  const entries = Object.values(records);
  const formatted = entries.map((rec, i) => {
    const title = rec.titles?.item?.en?.[0]?.title || '(no title)';
    const journal = rec.titles?.source?.en?.[0]?.title || 'N/A';

    const authorList = (rec.names?.author?.en || []).filter(Boolean);
    const authors = authorList
      .slice(0, 5)
      .map(a => `${a.last_name}, ${a.first_name}`.trim())
      .join('; ');
    const authorStr = authorList.length > 5
      ? `${authors}; et al.`
      : authors;

    const year = rec.pub_info?.pubyear || 'N/A';
    const doi = rec.doi || '';
    const citations = rec.citation_related?.counts?.WOSCC ?? 'N/A';
    const doctype = (rec.doctypes || []).join(', ') || 'N/A';
    const ut = rec.ut || '';

    // Volume/issue/pages
    const vol = rec.pub_info?.vol || '';
    const issue = rec.pub_info?.issue || '';
    const pages = rec.pub_info?.page_no || '';
    const bibParts = [];
    if (vol) bibParts.push(`Vol. ${vol}`);
    if (issue) bibParts.push(`Issue ${issue}`);
    if (pages) bibParts.push(`pp. ${pages}`);
    const bibInfo = bibParts.length > 0 ? bibParts.join(', ') : '';

    // JCR info — keyed by ISSN in the jcr payload, linked via rec.jcrKey
    let jcrInfo = '';
    const jcrKey = rec.jcrKey; // e.g. "ISSN:1364-0321"
    if (jcr && jcrKey && jcr[jcrKey]) {
      const jd = jcr[jcrKey];
      const ci = jd.CitationIndicator;
      if (ci != null) jcrInfo = `JCI: ${ci}`;
      // Get best quartile from categories
      const cats = jd.CategoryIFData || [];
      if (cats.length > 0) {
        const bestQ = cats.map(c => c.JifQuartile).filter(Boolean).sort()[0];
        if (bestQ) jcrInfo += jcrInfo ? `, ${bestQ}` : bestQ;
        const catNames = cats.map(c => `${c.CategoryName} (${c.JifQuartile})`).join('; ');
        if (catNames) jcrInfo += ` [${catNames}]`;
      }
    }

    // Abstract (first 200 chars, strip HTML)
    const rawAbstract = rec.abstract?.basic?.en?.abstract || '';
    const cleanAbstract = stripHtml(rawAbstract);
    const abstract = cleanAbstract
      ? cleanAbstract.slice(0, 200) + (cleanAbstract.length > 200 ? '...' : '')
      : '(no abstract)';

    return [
      `${i + 1}. ${stripHtml(title)}`,
      `   Authors: ${authorStr || 'N/A'}`,
      `   Journal: ${journal}`,
      bibInfo ? `   ${bibInfo}` : null,
      `   Year: ${year} | Citations: ${citations} | Type: ${doctype}`,
      doi ? `   DOI: ${doi}` : null,
      ut ? `   WoS ID: ${ut}` : null,
      jcrInfo ? `   JCR: ${jcrInfo}` : null,
      `   Abstract: ${abstract}`,
    ].filter(Boolean).join('\n');
  });

  const header = `Web of Science results for: ${wosQuery}\nTotal found: ${totalFound}, showing: ${entries.length}\n`;
  return header + '\n' + formatted.join('\n\n');
}

const toolDefinition = {
  type: 'function',
  function: {
    name: 'search_wos',
    description: 'Search academic papers via Web of Science (WoS). Provides access to the WoS Core Collection with citation counts, JCR journal rankings, and comprehensive bibliometric data. Use WoS field syntax for precise searches: TS=(topic), AU=(author), TI=(title), OG_SMART=(organization). Natural language queries are auto-wrapped in TS=(...).',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query. Can be natural language (e.g., "perovskite solar cell") or WoS syntax (e.g., "TS=(perovskite) AND AU=(Zhang)")',
        },
        count: {
          type: 'integer',
          description: 'Number of results to return (default: 10, max: 50)',
        },
        sort: {
          type: 'string',
          enum: ['relevance'],
          description: 'Sort order (currently only relevance is supported)',
        },
      },
      required: ['query'],
    },
  },
};

module.exports = { searchWoS, toolDefinition };
