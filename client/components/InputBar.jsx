import React, { useState, useRef, useEffect } from 'react';
import { t } from '../lib/i18n';

export default function InputBar({ onSend, onStop, isStreaming, thinking, onThinkingChange, webSearch, onWebSearchChange }) {
  const [text, setText] = useState('');
  const textareaRef = useRef(null);

  useEffect(() => {
    if (!isStreaming) {
      textareaRef.current?.focus();
    }
  }, [isStreaming]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (text.trim() && !isStreaming) {
      onSend(text);
      setText('');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
    }
  }, [text]);

  const showThinkingPill = typeof thinking === 'boolean' && typeof onThinkingChange === 'function';
  const showWebSearchPill = typeof webSearch === 'boolean' && typeof onWebSearchChange === 'function';
  const bangMode = text.startsWith('!');

  return (
    <form className="input-bar" onSubmit={handleSubmit}>
      <div className={`input-bar-inner ${bangMode ? 'bang-mode' : ''}`}>
        {bangMode && (
          <div className="bang-mode-hint">
            <span className="bang-mode-tag">bash</span>
            <span>Runs directly on the cluster (no LLM). Denylist still applies.</span>
          </div>
        )}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('inputPlaceholder')}
          disabled={isStreaming}
          rows={1}
        />
        <div className="input-bar-actions">
          {showThinkingPill && (
            <label
              className={`pill-toggle ${thinking ? 'active' : ''} ${isStreaming ? 'disabled' : ''}`}
              title={t('thinkingMode')}
            >
              <input
                type="checkbox"
                checked={thinking}
                onChange={(e) => onThinkingChange(e.target.checked)}
                disabled={isStreaming}
              />
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.4 1 1.1 1 1.8V18h6v-1.5c0-.7.4-1.4 1-1.8A7 7 0 0 0 12 2z"/>
              </svg>
              {t('thinkingMode')}
            </label>
          )}
          {showWebSearchPill && (
            <label
              className={`pill-toggle ${webSearch ? 'active' : ''} ${isStreaming ? 'disabled' : ''}`}
              title={t('webSearch')}
            >
              <input
                type="checkbox"
                checked={webSearch}
                onChange={(e) => onWebSearchChange(e.target.checked)}
                disabled={isStreaming}
              />
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10"/>
                <line x1="2" y1="12" x2="22" y2="12"/>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
              </svg>
              {t('webSearch')}
            </label>
          )}
          <div className="input-bar-spacer" />
          {isStreaming ? (
            <button type="button" className="btn-stop" onClick={onStop}>{t('stop')}</button>
          ) : (
            <button type="submit" className="btn-send" disabled={!text.trim()}>{t('send')}</button>
          )}
        </div>
      </div>
    </form>
  );
}
