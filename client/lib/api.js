const cfg = window.__RA__ || {};

export function getBaseURI() {
  return cfg.baseURI || '';
}

export function getCsrfToken() {
  return cfg.csrfToken || '';
}

export async function apiFetch(path, options = {}) {
  const url = `${getBaseURI()}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    'X-CSRF-Token': getCsrfToken(),
    ...options.headers,
  };
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }
  return res.json();
}
