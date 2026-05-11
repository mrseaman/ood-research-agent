import React, { useState, useCallback, useRef, useEffect } from 'react';
import ChatView from './components/ChatView';
import InputBar from './components/InputBar';
import SessionSidebar from './components/SessionSidebar';
import FileBrowser from './components/FileBrowser';
import { streamChat } from './lib/sse';
import { apiFetch } from './lib/api';
import { t, getLocale, setLocale, getAvailableLocales } from './lib/i18n';

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function getInitialTheme() {
  try {
    const stored = localStorage.getItem('ra-theme');
    if (stored === 'light' || stored === 'dark') return stored;
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
  } catch {}
  return 'light';
}

export default function App() {
  const [messages, setMessages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState(generateId);
  const [sessionTitle, setSessionTitle] = useState('');
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [pendingConfirm, setPendingConfirm] = useState(null);
  const [activeAgent, setActiveAgent] = useState(null);
  const [thinking, setThinking] = useState(true);
  const [webSearch, setWebSearch] = useState(false);
  const [autoApproveShell, setAutoApproveShell] = useState(false);
  const [theme, setTheme] = useState(getInitialTheme);
  const abortRef = useRef(null);
  const autoApproveRef = useRef(false);

  useEffect(() => { autoApproveRef.current = autoApproveShell; }, [autoApproveShell]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('ra-theme', theme); } catch {}
  }, [theme]);

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

    if (!sessionTitle) {
      setSessionTitle(text.slice(0, 60));
    }

    const assistantMsg = {
      role: 'assistant',
      content: '',
      reasoning: '',
      toolCalls: [],
      toolResults: {},
      parts: [],
    };
    let currentPartType = null;

    setMessages([...updatedMessages, assistantMsg]);
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const apiMessages = [];
    for (const m of updatedMessages) {
      if (m.role === 'user') {
        apiMessages.push({ role: 'user', content: m.content });
      } else if (m.role === 'assistant') {
        const msg = { role: 'assistant' };
        msg.content = m.content || '';
        if (m.reasoning) msg.reasoning_content = m.reasoning;
        if (m.toolCalls && m.toolCalls.length > 0) {
          msg.tool_calls = m.toolCalls.map(tc => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: JSON.stringify(tc.args || {}) },
          }));
        }
        apiMessages.push(msg);
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
          const part = assistantMsg.parts.find(p => p.type === 'toolCall' && p.toolCall?.id === data.id);
          if (part) part.result = data;
          setMessages(prev => [...prev.slice(0, -1), { ...assistantMsg, parts: [...assistantMsg.parts] }]);
        },
        onToolConfirm(data) {
          if (autoApproveRef.current) {
            apiFetch(`/api/confirm/${data.id}`, {
              method: 'POST',
              body: JSON.stringify({ approved: true }),
            }).catch(() => {});
          } else {
            setPendingConfirm(data);
          }
        },
        onAgentStart(data) { setActiveAgent(data.agent); },
        onAgentEnd() { setActiveAgent(null); },
        onError(text) {
          assistantMsg.content += `\n\n**${t('error')}** ${text}`;
          setMessages(prev => [...prev.slice(0, -1), { ...assistantMsg }]);
        },
        onDone() {},
      }, controller.signal, selectedModel, thinking, webSearch);
    } catch (err) {
      if (err.name !== 'AbortError') {
        assistantMsg.content += `\n\n**${t('error')}** ${err.message}`;
        setMessages(prev => [...prev.slice(0, -1), { ...assistantMsg }]);
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }

    const finalMessages = [...updatedMessages, assistantMsg];
    saveSession(finalMessages, sessionTitle || text.slice(0, 60));
  }, [messages, isStreaming, sessionTitle, saveSession, selectedModel, thinking, webSearch]);

  const handleConfirm = useCallback(async (id, approved) => {
    setPendingConfirm(null);
    try {
      await apiFetch(`/api/confirm/${id}`, {
        method: 'POST',
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
    } catch (err) {
      console.error('Failed to load session:', err);
    }
  }, []);

  const appName = t('appName');
  const initial = (appName || 'R').trim().charAt(0).toUpperCase();

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-logo">{initial}</div>
          <h2>{appName}</h2>
        </div>

        <button className="sidebar-new-chat" onClick={handleNewChat}>
          <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M10 3a1 1 0 0 1 1 1v5h5a1 1 0 1 1 0 2h-5v5a1 1 0 1 1-2 0v-5H4a1 1 0 1 1 0-2h5V4a1 1 0 0 1 1-1z"/>
          </svg>
          {t('newChat')}
        </button>

        <div className="sidebar-sections">
          <div className="sidebar-section expand">
            <div className="sidebar-section-title">{t('sessions')}</div>
            <SessionSidebar currentId={sessionId} onSelect={handleLoadSession} />
          </div>
          <div className="sidebar-section expand">
            <div className="sidebar-section-title">{t('files') || 'Files'}</div>
            <FileBrowser />
          </div>
        </div>

        <div className="sidebar-footer">
          <select
            className="locale-select"
            value={getLocale()}
            onChange={(e) => setLocale(e.target.value)}
            aria-label="Language"
          >
            {getAvailableLocales().map(l => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
          <button
            className="icon-btn"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="4"/>
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            )}
          </button>
        </div>
      </aside>

      <main className="chat-main">
        {models.length > 1 && (
          <div className="chat-toolbar">
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
          </div>
        )}

        <div className="chat-card">
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
          <InputBar
            onSend={handleSend}
            onStop={handleStop}
            isStreaming={isStreaming}
            thinking={thinking}
            onThinkingChange={setThinking}
            webSearch={webSearch}
            onWebSearchChange={setWebSearch}
          />
        </div>

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
  );
}
