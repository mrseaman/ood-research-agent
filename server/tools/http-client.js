'use strict';

const https = require('https');
const http = require('http');
const tls = require('tls');
const { URL } = require('url');

const DEFAULT_TIMEOUT = 15000;

/**
 * Shared HTTP client with automatic proxy support.
 *
 * Reads proxy from environment variables (http_proxy / https_proxy).
 * For HTTPS targets, uses HTTP CONNECT tunneling through the proxy.
 * For HTTP targets, sends the full URL to the proxy.
 *
 * Local/internal targets (localhost, 127.0.0.1) bypass the proxy.
 */

function getProxy(protocol) {
  if (protocol === 'https:') {
    return process.env.https_proxy || process.env.HTTPS_PROXY
      || process.env.http_proxy || process.env.HTTP_PROXY || '';
  }
  return process.env.http_proxy || process.env.HTTP_PROXY || '';
}

function isLocal(hostname) {
  return hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '::1'
    || hostname.endsWith('.local');
}

function isNoProxy(hostname) {
  const noProxy = process.env.no_proxy || process.env.NO_PROXY || '';
  if (!noProxy) return false;
  if (noProxy === '*') return true;
  return noProxy.split(',').some(entry => {
    const h = entry.trim().toLowerCase();
    if (!h) return false;
    const host = hostname.toLowerCase();
    return host === h || host.endsWith(h.startsWith('.') ? h : `.${h}`);
  });
}

function needsProxy(hostname, protocol) {
  if (isLocal(hostname)) return false;
  if (isNoProxy(hostname)) return false;
  return !!getProxy(protocol);
}

/**
 * Establish a tunnel through an HTTP proxy using CONNECT.
 * Returns a raw TCP socket connected to the target through the proxy.
 */
function connectViaProxy(proxyUrl, targetHost, targetPort, timeout) {
  return new Promise((resolve, reject) => {
    const proxy = new URL(proxyUrl);
    const headers = { Host: `${targetHost}:${targetPort}` };

    if (proxy.username) {
      const auth = Buffer.from(
        `${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password || '')}`
      ).toString('base64');
      headers['Proxy-Authorization'] = `Basic ${auth}`;
    }

    const req = http.request({
      hostname: proxy.hostname,
      port: proxy.port || 8080,
      method: 'CONNECT',
      path: `${targetHost}:${targetPort}`,
      headers,
    });

    req.setTimeout(timeout, () => req.destroy(new Error('Proxy connect timeout')));
    req.on('error', reject);

    req.on('connect', (res, socket) => {
      if (res.statusCode !== 200) {
        socket.destroy();
        return reject(new Error(`Proxy CONNECT failed: ${res.statusCode}`));
      }
      resolve(socket);
    });

    req.end();
  });
}

/**
 * Core request function. Handles proxy tunneling and direct connections.
 */
function doRequest(url, options, handleResponse) {
  const method = options.method || 'GET';
  const headers = { ...options.headers };
  const timeout = options.timeout || DEFAULT_TIMEOUT;

  return new Promise(async (resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const targetHost = parsed.hostname;
    const targetPort = parsed.port || (isHttps ? 443 : 80);
    const reqPath = parsed.pathname + parsed.search;

    if (options.body && !headers['Content-Length']) {
      headers['Content-Length'] = Buffer.byteLength(options.body);
    }

    let req;

    try {
      if (needsProxy(targetHost, parsed.protocol)) {
        const proxyUrl = getProxy(parsed.protocol);

        if (isHttps) {
          // HTTPS through proxy: CONNECT tunnel, then TLS, then HTTP over TLS
          const socket = await connectViaProxy(proxyUrl, targetHost, targetPort, timeout);
          const tlsSocket = tls.connect({
            socket,
            servername: targetHost,
            rejectUnauthorized: false,
          });

          // Use http.request (not https) because TLS is already handled by tls.connect
          req = http.request({
            createConnection: () => tlsSocket,
            hostname: targetHost,
            port: targetPort,
            path: reqPath,
            method,
            headers,
          }, (res) => handleResponse(res, resolve, reject));
        } else {
          // HTTP through proxy: send full URL as path
          const proxy = new URL(proxyUrl);
          const proxyHeaders = { ...headers };
          if (proxy.username) {
            const auth = Buffer.from(
              `${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password || '')}`
            ).toString('base64');
            proxyHeaders['Proxy-Authorization'] = `Basic ${auth}`;
          }

          req = http.request({
            hostname: proxy.hostname,
            port: proxy.port || 8080,
            path: url,
            method,
            headers: proxyHeaders,
          }, (res) => handleResponse(res, resolve, reject));
        }
      } else {
        // Direct connection (local or no proxy)
        const transport = isHttps ? https : http;
        req = transport.request({
          hostname: targetHost,
          port: targetPort,
          path: reqPath,
          method,
          headers,
          rejectUnauthorized: false,
        }, (res) => handleResponse(res, resolve, reject));
      }
    } catch (err) {
      return reject(err);
    }

    req.setTimeout(timeout, () => req.destroy(new Error('Request timeout')));
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

/**
 * Make an HTTP/HTTPS request with automatic proxy support.
 *
 * @param {string} url - Target URL
 * @param {Object} [options] - { method, headers, body, timeout, maxBody }
 * @returns {Promise<string>} Response body as string
 */
function httpRequest(url, options = {}) {
  const maxBody = options.maxBody || Infinity;

  return doRequest(url, options, (res, resolve, reject) => {
    if (res.statusCode >= 400) {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString().slice(0, 500);
        reject(new Error(`HTTP ${res.statusCode}: ${body}`));
      });
      return;
    }

    const chunks = [];
    let totalSize = 0;
    res.on('data', (chunk) => {
      totalSize += chunk.length;
      if (totalSize <= maxBody) chunks.push(chunk);
    });
    res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });
}

/**
 * Like httpRequest but follows redirects (up to maxRedirects).
 */
function httpRequestFollowRedirects(url, options = {}, redirectCount = 0) {
  const maxRedirects = options.maxRedirects || 3;
  const maxBody = options.maxBody || Infinity;

  return doRequest(url, options, (res, resolve, reject) => {
    // Follow redirects
    if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
      // Consume the response body to free the socket
      res.resume();
      if (redirectCount >= maxRedirects) {
        return reject(new Error('Too many redirects'));
      }
      try {
        const redirectUrl = new URL(res.headers.location, url).href;
        return httpRequestFollowRedirects(redirectUrl, options, redirectCount + 1)
          .then(resolve, reject);
      } catch {
        return reject(new Error(`Bad redirect URL: ${res.headers.location}`));
      }
    }

    if (res.statusCode >= 400) {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString().slice(0, 500);
        reject(new Error(`HTTP ${res.statusCode}: ${body}`));
      });
      return;
    }

    const chunks = [];
    let totalSize = 0;
    res.on('data', (chunk) => {
      totalSize += chunk.length;
      if (totalSize <= maxBody) chunks.push(chunk);
    });
    res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });
}

/**
 * Like httpRequest but returns { statusCode, headers, body } instead of
 * throwing on non-200 responses. Useful for auth flows that need 302 handling.
 */
function httpRequestRaw(url, options = {}) {
  return doRequest(url, options, (res, resolve) => {
    const chunks = [];
    res.on('data', (chunk) => chunks.push(chunk));
    res.on('end', () => {
      resolve({
        statusCode: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString('utf-8'),
      });
    });
  });
}

module.exports = { httpRequest, httpRequestFollowRedirects, httpRequestRaw, getProxy, connectViaProxy };
