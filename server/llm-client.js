'use strict';

const https = require('https');
const http = require('http');
const tls = require('tls');
const { URL } = require('url');
const { getProxy, connectViaProxy } = require('./tools/http-client');

/**
 * Call the LLM API with streaming enabled.
 * Uses direct connection by default. Set modelConfig.useProxy = true
 * to route through the HTTP proxy (for external API endpoints).
 *
 * @param {Array} messages - conversation messages
 * @param {Array} tools - tool definitions
 * @param {Object} modelConfig - { endpoint, token, model, useProxy }
 * @param {Object} options - { thinking }
 */
async function* streamChat(messages, tools, modelConfig, options = {}) {
  const body = {
    model: modelConfig.model,
    messages: messages,
    stream: true,
  };

  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }

  if (options.thinking !== undefined) {
    const enabled = !!options.thinking;
    // Top-level form (Qwen3 / DashScope)
    body.enable_thinking = enabled;
    // vLLM-served reasoning models (DeepSeek-R1/V4, Qwen3) take it via chat_template_kwargs
    body.chat_template_kwargs = {
      ...(body.chat_template_kwargs || {}),
      enable_thinking: enabled,
      thinking: enabled,
    };
  }

  const payload = JSON.stringify(body);
  const parsed = new URL(modelConfig.endpoint);
  const isHttps = parsed.protocol === 'https:';
  const targetHost = parsed.hostname;
  const targetPort = parsed.port || (isHttps ? 443 : 80);
  const reqPath = parsed.pathname + parsed.search;
  const timeout = 120000;

  const headers = {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  };

  if (modelConfig.token) {
    headers['Authorization'] = `Bearer ${modelConfig.token}`;
  }

  const useProxy = modelConfig.useProxy && !!getProxy(parsed.protocol);

  const response = await new Promise(async (resolve, reject) => {
    let req;

    try {
      if (useProxy) {
        const proxyUrl = getProxy(parsed.protocol);

        if (isHttps) {
          const socket = await connectViaProxy(proxyUrl, targetHost, targetPort, timeout);
          const tlsSocket = tls.connect({
            socket,
            servername: targetHost,
            rejectUnauthorized: false,
          });

          req = http.request({
            createConnection: () => tlsSocket,
            hostname: targetHost,
            port: targetPort,
            path: reqPath,
            method: 'POST',
            headers,
          }, (res) => resolve(res));
        } else {
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
            path: modelConfig.endpoint,
            method: 'POST',
            headers: proxyHeaders,
          }, (res) => resolve(res));
        }
      } else {
        const transport = isHttps ? https : http;
        req = transport.request({
          hostname: targetHost,
          port: targetPort,
          path: reqPath,
          method: 'POST',
          headers,
          rejectUnauthorized: false,
        }, (res) => resolve(res));
      }
    } catch (err) {
      return reject(err);
    }

    req.setTimeout(timeout, () => { req.destroy(new Error('Request timeout')); });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });

  if (response.statusCode !== 200) {
    const chunks = [];
    for await (const chunk of response) chunks.push(chunk);
    const text = Buffer.concat(chunks).toString();
    throw new Error(`LLM API error ${response.statusCode}: ${text}`);
  }

  let buffer = '';

  for await (const chunk of response) {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === 'data: [DONE]') continue;
      if (!trimmed.startsWith('data: ')) continue;

      try {
        const data = JSON.parse(trimmed.slice(6));
        yield data;
      } catch (e) {
        // skip malformed JSON
      }
    }
  }

  if (buffer.trim() && buffer.trim() !== 'data: [DONE]' && buffer.trim().startsWith('data: ')) {
    try {
      const data = JSON.parse(buffer.trim().slice(6));
      yield data;
    } catch (e) {
      // skip
    }
  }
}

module.exports = { streamChat };
