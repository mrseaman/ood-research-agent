import React, { useState, useCallback, useRef, useEffect } from 'react';
import ChatView from './components/ChatView';
import InputBar from './components/InputBar';
import SessionSidebar from './components/SessionSidebar';
import { streamChat } from './lib/sse';
import { apiFetch, getBaseURI, getCsrfToken } from './lib/api';
import { t } from './lib/i18n';

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export default function App() {
  const [messages, setMessages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState(generateId);
  const [sessionTitle, setSessionTitle] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [pendingConfirm, setPendingConfirm] = useState(null);
  const [activeAgent, setActiveAgent] = useState(null);
  const [thinking, setThinking] = useState(true);
  const [autoApproveShell, setAutoApproveShell] = useState(false);
  const abortRef = useRef(null);
  const autoApproveRef = useRef(false);

  useEffect(() => { autoApproveRef.current = autoApproveShell; }, [autoApproveShell]);

  // Fetch available models on mount
  useEffect(() => {
    apiFetch('/api/models')
      .then(data => {
        setModels(data.models || []);
        setSelectedModel(data.default || (data.models?.[0]?.id) || '');
      })
      .catch(() => {});
  }, []);

  const saveSession = useCallback(async (msgs, title) => {
    try {
      await apiFetch('/api/sessions', {
        method: 'POST',
        body: JSON.stringify({
          id: sessionId,
          title: title || sessionTitle || msgs[0]?.content?.slice(0, 60) || 'Untitled',
          messages: msgs,
        }),
      });
    } catch {
      // silent fail for session save
    }
  }, [sessionId, sessionTitle]);

  const handleSend = useCallback(async (text) => {
    if (isStreaming || !text.trim()) return;

    const userMsg = { role: 'user', content: text };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);

    // Set title from first message
    if (!sessionTitle) {
      setSessionTitle(text.slice(0, 60));
    }

    // Create placeholder for assistant response
    const assistantMsg = {
      role: 'assistant',
      content: '',
      reasoning: '',
      toolCalls: [],
      toolResults: {},
      parts: [],  // ordered sequence of { type, content/toolCall/result }
    };
    // Track which part type we're currently appending to
    let currentPartType = null;

    setMessages([...updatedMessages, assistantMsg]);
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    // Build messages for API: reconstruct proper OpenAI-format history
    const apiMessages = [];
    for (const m of updatedMessages) {
      if (m.role === 'user') {
        apiMessages.push({ role: 'user', content: m.content });
      } else if (m.role === 'assistant') {
        const msg = { role: 'assistant' };
        msg.content = m.content || '';
        if (m.reasoning) msg.reasoning_content = m.reasoning;
        // Include tool calls if any
        if (m.toolCalls && m.toolCalls.length > 0) {
          msg.tool_calls = m.toolCalls.map(tc => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: JSON.stringify(tc.args || {}) },
          }));
        }
        apiMessages.push(msg);
        // Append tool results as separate messages
        if (m.toolCalls && m.toolCalls.length > 0 && m.toolResults) {
          for (const tc of m.toolCalls) {
            const tr = m.toolResults[tc.id];
            if (tr) {
              apiMessages.push({
                role: 'tool',
                tool_call_id: tc.id,
                content: tr.result || '',
              });
            }
          }
        }
      }
    }

    try {
      await streamChat(apiMessages, {
        onReasoning(text) {
          assistantMsg.reasoning += text;
          // Append to current reasoning part or create a new one
          if (currentPartType !== 'reasoning') {
            assistantMsg.parts.push({ type: 'reasoning', content: '' });
            currentPartType = 'reasoning';
          }
          assistantMsg.parts[assistantMsg.parts.length - 1].content += text;
          setMessages(prev => [...prev.slice(0, -1), { ...assistantMsg, parts: [...assistantMsg.parts] }]);
        },
        onContent(text) {
          assistantMsg.content += text;
          if (currentPartType !== 'content') {
            assistantMsg.parts.push({ type: 'content', content: '' });
            currentPartType = 'content';
          }
          assistantMsg.parts[assistantMsg.parts.length - 1].content += text;
          setMessages(prev => [...prev.slice(0, -1), { ...assistantMsg, parts: [...assistantMsg.parts] }]);
        },
        onToolCall(data) {
          assistantMsg.toolCalls.push(data);
          assistantMsg.parts.push({ type: 'toolCall', toolCall: data });
          currentPartType = 'toolCall';
          setMessages(prev => [...prev.slice(0, -1), { ...assistantMsg, parts: [...assistantMsg.parts] }]);
        },
        onToolResult(data) {
          assistantMsg.toolResults[data.id] = data;
          // Update the matching toolCall part with result
          const part = assistantMsg.parts.find(p => p.type === 'toolCall' && p.toolCall?.id === data.id);
          if (part) part.result = data;
          setMessages(prev => [...prev.slice(0, -1), { ...assistantMsg, parts: [...assistantMsg.parts] }]);
        },
        onToolConfirm(data) {
          if (autoApproveRef.current) {
            fetch(`${getBaseURI()}/api/confirm/${data.id}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrfToken() },
              body: JSON.stringify({ approved: true }),
            }).catch(() => {});
          } else {
            setPendingConfirm(data);
          }
        },
        onAgentStart(data) {
          setActiveAgent(data.agent);
        },
        onAgentEnd() {
          setActiveAgent(null);
        },
        onError(text) {
          assistantMsg.content += `\n\n**${t('error')}** ${text}`;
          setMessages(prev => [...prev.slice(0, -1), { ...assistantMsg }]);
        },
        onDone() {
          // handled in finally
        },
      }, controller.signal, selectedModel, thinking);
    } catch (err) {
      if (err.name !== 'AbortError') {
        assistantMsg.content += `\n\n**${t('error')}** ${err.message}`;
        setMessages(prev => [...prev.slice(0, -1), { ...assistantMsg }]);
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }

    // Save session
    const finalMessages = [...updatedMessages, assistantMsg];
    saveSession(finalMessages, sessionTitle || text.slice(0, 60));
  }, [messages, isStreaming, sessionTitle, saveSession, selectedModel, thinking]);

  const handleConfirm = useCallback(async (id, approved) => {
    setPendingConfirm(null);
    try {
      await fetch(`${getBaseURI()}/api/confirm/${id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': getCsrfToken(),
        },
        body: JSON.stringify({ approved }),
      });
    } catch (err) {
      console.error('Confirmation failed:', err);
    }
  }, []);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, []);

  const handleNewChat = useCallback(() => {
    setMessages([]);
    setSessionId(generateId());
    setSessionTitle('');
    setActiveAgent(null);
    setAutoApproveShell(false);
  }, []);

  const handleLoadSession = useCallback(async (id) => {
    try {
      const session = await apiFetch(`/api/sessions/${id}`);
      setSessionId(session.id);
      setSessionTitle(session.title || '');
      setMessages(session.messages || []);
      setSidebarOpen(false);
    } catch (err) {
      console.error('Failed to load session:', err);
    }
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <button className="btn-icon" onClick={() => setSidebarOpen(!sidebarOpen)} title={t('sessions')}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <rect x="2" y="3" width="16" height="2" rx="1"/>
            <rect x="2" y="9" width="16" height="2" rx="1"/>
            <rect x="2" y="15" width="16" height="2" rx="1"/>
          </svg>
        </button>
        <h1>{t('appName')}</h1>
        {models.length > 1 && (
          <select
            className="model-select"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            disabled={isStreaming}
          >
            {models.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        )}
        <label className="thinking-toggle" title={t('thinkingMode')}>
          <input
            type="checkbox"
            checked={thinking}
            onChange={(e) => setThinking(e.target.checked)}
            disabled={isStreaming}
          />
          <span>{t('thinkingMode')}</span>
        </label>
        <button className="btn-new" onClick={handleNewChat}>{t('newChat')}</button>
      </header>

      <div className="app-body">
        {sidebarOpen && (
          <SessionSidebar
            currentId={sessionId}
            onSelect={handleLoadSession}
            onClose={() => setSidebarOpen(false)}
          />
        )}
        <main className="chat-main">
          <ChatView messages={messages} />
          {isStreaming && (
            <div className="streaming-indicator">
              <span className="streaming-dot" />
              {activeAgent
                ? (activeAgent === 'files_and_compute' ? t('agentFiles') || 'Working with files...'
                  : activeAgent === 'web_research' ? t('agentWeb') || 'Searching the web...'
                  : activeAgent === 'literature' ? t('agentLit') || 'Searching literature...'
                  : `Agent: ${activeAgent}`)
                : t('thinking') || 'Thinking...'}
            </div>
          )}
          <InputBar onSend={handleSend} onStop={handleStop} isStreaming={isStreaming} />
          {pendingConfirm && (
            <div className="confirm-overlay">
              <div className="confirm-dialog">
                <h3>{t('confirmTitle') || 'Command Requires Approval'}</h3>
                <p>{t('confirmDesc') || 'The assistant wants to run the following shell command:'}</p>
                <pre className="confirm-command">{pendingConfirm.command}</pre>
                <div className="confirm-actions">
                  <button className="btn-approve" onClick={() => handleConfirm(pendingConfirm.id, true)}>
                    {t('approve') || 'Approve'}
                  </button>
                  <button className="btn-approve-all" onClick={() => {
                    setAutoApproveShell(true);
                    handleConfirm(pendingConfirm.id, true);
                  }}>
                    {t('approveAll') || 'Approve All'}
                  </button>
                  <button className="btn-deny" onClick={() => handleConfirm(pendingConfirm.id, false)}>
                    {t('deny') || 'Deny'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
