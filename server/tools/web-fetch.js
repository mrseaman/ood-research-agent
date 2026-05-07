'use strict';

const { httpRequestFollowRedirects } = require('./http-client');

/**
 * Strip HTML to readable text.
 * Removes scripts, styles, tags, and collapses whitespace.
 */
function htmlToText(html) {
  let text = html;

  // Remove script/style blocks
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, '');

  // Convert common block elements to newlines
  text = text.replace(/<\/?(p|div|br|hr|h[1-6]|li|tr|blockquote|pre|section|article|header|footer)\b[^>]*\/?>/gi, '\n');

  // Remove all remaining tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode common HTML entities
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&nbsp;/g, ' ');

  // Collapse whitespace
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n[ \t]*/g, '\n');
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.trim();

  return text;
}

/**
 * Fetch a URL and return its text content.
 */
async function fetchUrl({ url }) {
  if (!url || !url.trim()) {
    throw new Error('URL is required');
  }

  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error('URL must start with http:// or https://');
  }

  const raw = await httpRequestFollowRedirects(trimmed, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; ResearchAssistant/1.0)',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
    },
    maxBody: 200 * 1024,
  });

  // If it looks like HTML, extract text
  const probe = raw.slice(0, 500).toLowerCase();
  if (probe.includes('<html') || probe.includes('<!doctype') || probe.includes('<head')) {
    const text = htmlToText(raw);
    const maxLen = 30000;
    if (text.length > maxLen) {
      return text.slice(0, maxLen) + '\n\n...(truncated)';
    }
    return text;
  }

  // Plain text or other format
  if (raw.length > 30000) {
    return raw.slice(0, 30000) + '\n\n...(truncated)';
  }
  return raw;
}

module.exports = { fetchUrl };
