'use strict';

const { httpRequest } = require('./http-client');

/**
 * Search academic papers via OpenAlex API.
 * Free, no API key required. Polite pool (higher rate limits) with mailto param.
 *
 * Optional env var:
 *   RA_OPENALEX_EMAIL — email for OpenAlex polite pool (higher rate limits)
 *
 * API docs: https://docs.openalex.org/
 */

const OA_BASE = 'https://api.openalex.org/works';
const OA_EMAIL = process.env.RA_OPENALEX_EMAIL || 'research-agent@openalex.org';

const SORT_MAP = {
  relevance: 'relevance_score:desc',
  citations: 'cited_by_count:desc',
  date_desc: 'publication_year:desc',
  date_asc: 'publication_year:asc',
};

/**
 * Reconstruct abstract text from OpenAlex inverted index format.
 */
function reconstructAbstract(invertedIndex) {
  if (!invertedIndex) return '';
  const words = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    for (const pos of positions) {
      words[pos] = word;
    }
  }
  return words.join(' ');
}

/**
 * Format author list from OpenAlex authorships array.
 */
function formatAuthors(authorships, max) {
  if (!authorships || authorships.length === 0) return 'Unknown';
  const names = authorships.slice(0, max).map(a => a.author?.display_name || 'Unknown');
  const str = names.join(', ');
  return authorships.length > max ? `${str}, et al.` : str;
}

/**
 * Search for papers by keyword query.
 */
async function searchPapers({ query, num_results, year_from, year_to, fields_of_study, sort }) {
  const limit = Math.min(Math.max(num_results || 10, 1), 50);

  if (!query || !query.trim()) {
    throw new Error('Search query is required');
  }

  const selectFields = 'id,doi,title,authorships,publication_year,cited_by_count,primary_location,abstract_inverted_index,type,open_access';

  const params = new URLSearchParams();
  params.set('search', query);
  params.set('per_page', String(limit));
  params.set('select', selectFields);
  params.set('mailto', OA_EMAIL);

  // Sort
  const sortKey = sort && SORT_MAP[sort] ? SORT_MAP[sort] : SORT_MAP.relevance;
  params.set('sort', sortKey);

  // Year range filter
  const filters = [];
  if (year_from && year_to) {
    filters.push(`publication_year:${year_from}-${year_to}`);
  } else if (year_from) {
    filters.push(`publication_year:${year_from}-`);
  } else if (year_to) {
    filters.push(`publication_year:-${year_to}`);
  }

  if (filters.length > 0) {
    params.set('filter', filters.join(','));
  }

  const url = `${OA_BASE}?${params.toString()}`;
  const raw = await httpRequest(url);
  const data = JSON.parse(raw);
  const papers = data.results || [];

  if (papers.length === 0) {
    return 'No papers found.';
  }

  return papers.map((p, i) => {
    const authors = formatAuthors(p.authorships, 5);
    const journal = p.primary_location?.source?.display_name || 'N/A';
    const doi = p.doi ? p.doi.replace('https://doi.org/', '') : '';
    const abstract = reconstructAbstract(p.abstract_inverted_index);
    const abstractStr = abstract
      ? abstract.slice(0, 300) + (abstract.length > 300 ? '...' : '')
      : '(no abstract)';

    return [
      `${i + 1}. ${p.title}`,
      `   Authors: ${authors}`,
      `   Journal: ${journal}`,
      `   Year: ${p.publication_year || 'N/A'} | Citations: ${p.cited_by_count || 0}`,
      doi ? `   DOI: ${doi}` : null,
      p.open_access?.oa_url ? `   Open Access: ${p.open_access.oa_url}` : null,
      `   Abstract: ${abstractStr}`,
    ].filter(Boolean).join('\n');
  }).join('\n\n');
}

/**
 * Get details of a specific paper by DOI, OpenAlex ID, or PMID.
 */
async function getPaper({ paper_id }) {
  if (!paper_id || !paper_id.trim()) {
    throw new Error('Paper ID is required (DOI, OpenAlex ID, or PMID)');
  }

  const id = paper_id.trim();
  let lookupId;

  if (id.startsWith('https://openalex.org/') || id.startsWith('W')) {
    // OpenAlex ID
    lookupId = id.startsWith('W') ? `https://openalex.org/${id}` : id;
  } else if (id.startsWith('https://doi.org/')) {
    // Full DOI URL
    lookupId = id;
  } else if (/^10\.\d{4,}\//.test(id)) {
    // Bare DOI
    lookupId = `https://doi.org/${id}`;
  } else if (/^DOI:/i.test(id)) {
    // DOI: prefix (from old Semantic Scholar format)
    lookupId = `https://doi.org/${id.replace(/^DOI:/i, '')}`;
  } else if (/^\d+$/.test(id)) {
    // PMID
    lookupId = `pmid:${id}`;
  } else {
    // Try as-is
    lookupId = id;
  }

  const selectFields = 'id,doi,title,authorships,publication_year,cited_by_count,primary_location,abstract_inverted_index,type,open_access,referenced_works_count';
  const url = `${OA_BASE}/${encodeURIComponent(lookupId)}?select=${selectFields}&mailto=${OA_EMAIL}`;

  const raw = await httpRequest(url);
  const p = JSON.parse(raw);

  const authors = formatAuthors(p.authorships, Infinity);
  const journal = p.primary_location?.source?.display_name || 'N/A';
  const doi = p.doi ? p.doi.replace('https://doi.org/', '') : '';
  const abstract = reconstructAbstract(p.abstract_inverted_index);

  return [
    `Title: ${p.title}`,
    `Authors: ${authors}`,
    `Year: ${p.publication_year || 'N/A'} | Journal: ${journal}`,
    `Type: ${p.type || 'N/A'}`,
    `Citations: ${p.cited_by_count || 0} | References: ${p.referenced_works_count || 0}`,
    doi ? `DOI: ${doi}` : null,
    p.open_access?.is_oa ? `Open Access: Yes` : `Open Access: No`,
    p.open_access?.oa_url ? `OA URL: ${p.open_access.oa_url}` : null,
    p.id ? `OpenAlex: ${p.id}` : null,
    abstract ? `\nAbstract:\n${abstract}` : null,
  ].filter(Boolean).join('\n');
}

module.exports = { searchPapers, getPaper };
