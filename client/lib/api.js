const cfg = window.__RA__ || {};

let currentToken = cfg.csrfToken || '';

export function getBaseURI() {
  return cfg.baseURI || '';
}

export function getCsrfToken() {
  return currentToken;
}

export async function refreshCsrfToken() {
  try {
    const res = await fetch(`${getBaseURI()}/api/csrf`, { credentials: 'same-origin' });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.csrfToken) {
      currentToken = data.csrfToken;
      return currentToken;
    }
  } catch {}
  return null;
}

function isCsrfError(status, body) {
  return status === 403 && typeof body === 'string' && body.includes('CSRF');
}

async function rawFetch(path, options) {
  const url = `${getBaseURI()}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    'X-CSRF-Token': getCsrfToken(),
    ...options.headers,
  };
  return fetch(url, { ...options, headers });
}

export async function apiFetch(path, options = {}) {
  let res = await rawFetch(path, options);
  if (res.status === 403) {
    const body = await res.text();
    if (isCsrfError(res.status, body) && options.method && options.method !== 'GET') {
      const fresh = await refreshCsrfToken();
      if (fresh) {
        res = await rawFetch(path, options);
        if (res.ok) return res.json();
      }
      throw new Error(`API error ${res.status}: ${body}`);
    }
    throw new Error(`API error ${res.status}: ${body}`);
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }
  return res.json();
}
