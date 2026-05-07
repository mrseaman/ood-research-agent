import React, { useRef, useEffect, useState, useCallback } from 'react';
import MessageBubble from './MessageBubble';
import { t } from '../lib/i18n';

export default function ChatView({ messages }) {
  const bottomRef = useRef(null);
  const containerRef = useRef(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Track whether user has scrolled up
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    setAutoScroll(atBottom);
  }, []);

  useEffect(() => {
    if (autoScroll) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, autoScroll]);

  if (messages.length === 0) {
    return (
      <div className="chat-view chat-empty">
        <div className="empty-state">
          <h2>{t('appName')}</h2>
          <p>{t('appDescription')}</p>
          <div className="suggestions">
            <div className="suggestion">{t('suggestion1')}</div>
            <div className="suggestion">{t('suggestion2')}</div>
            <div className="suggestion">{t('suggestion3')}</div>
            <div className="suggestion">{t('suggestion4')}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-view" ref={containerRef} onScroll={handleScroll}>
      {messages.map((msg, i) => (
        <MessageBubble key={i} message={msg} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
