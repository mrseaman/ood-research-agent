import { getBaseURI, getCsrfToken } from './api';

/**
 * Send a chat request and read the SSE stream.
 * @param {Array} messages - conversation messages
 * @param {Object} callbacks - { onReasoning, onContent, onToolCall, onToolResult, onError, onDone }
 * @param {AbortSignal} [signal] - optional abort signal
 */
export async function streamChat(messages, callbacks, signal, modelId, thinking) {
  const url = `${getBaseURI()}/api/chat`;

  const body = { messages };
  if (modelId) body.modelId = modelId;
  if (thinking !== undefined) body.thinking = !!thinking;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': getCsrfToken(),
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    callbacks.onError?.(`HTTP ${response.status}: ${text}`);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let streamDone = false;
  let currentEvent = null;

  try {
    while (!streamDone) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7).trim();
          console.log('[SSE] event:', currentEvent);
        } else if (line.startsWith('data: ') && currentEvent) {
          try {
            const data = JSON.parse(line.slice(6));
            switch (currentEvent) {
              case 'reasoning':
                callbacks.onReasoning?.(data.text);
                break;
              case 'content':
                callbacks.onContent?.(data.text);
                break;
              case 'tool_call':
                callbacks.onToolCall?.(data);
                break;
              case 'tool_result':
                callbacks.onToolResult?.(data);
                break;
              case 'tool_confirm':
                console.log('[SSE DEBUG] tool_confirm received:', data);
                callbacks.onToolConfirm?.(data);
                break;
              case 'agent_start':
                callbacks.onAgentStart?.(data);
                break;
              case 'agent_end':
                callbacks.onAgentEnd?.(data);
                break;
              case 'error':
                callbacks.onError?.(data.text);
                break;
              case 'done':
                streamDone = true;
                break;
              default:
                console.log('[SSE] unhandled event:', currentEvent, data);
            }
          } catch {
            // skip malformed JSON
          }
          currentEvent = null;
        } else if (line.trim() === '') {
          currentEvent = null;
        } else if (line.trim() && !line.startsWith(':')) {
          console.log('[SSE] unparsed line:', line, 'currentEvent:', currentEvent);
        }
      }
    }
  } finally {
    try { reader.cancel(); } catch {}
  }
}
