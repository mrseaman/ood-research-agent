import React, { useState, useRef, useEffect } from 'react';
import { t } from '../lib/i18n';

export default function InputBar({ onSend, onStop, isStreaming }) {
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

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
    }
  }, [text]);

  return (
    <form className="input-bar" onSubmit={handleSubmit}>
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t('inputPlaceholder')}
        disabled={isStreaming}
        rows={1}
      />
      {isStreaming ? (
        <button type="button" className="btn-stop" onClick={onStop}>{t('stop')}</button>
      ) : (
        <button type="submit" className="btn-send" disabled={!text.trim()}>{t('send')}</button>
      )}
    </form>
  );
}
