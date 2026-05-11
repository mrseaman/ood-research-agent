import React, { useState } from 'react';
import { t } from '../lib/i18n';

export default function ThinkingBlock({ content }) {
  const [expanded, setExpanded] = useState(false);

  if (!content) return null;

  return (
    <div className="thinking-block">
      <button
        className="thinking-toggle-btn"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="thinking-icon">{expanded ? '\u25BC' : '\u25B6'}</span>
        <span>{t('thinking')}</span>
      </button>
      {expanded && (
        <div className="thinking-content">
          <pre>{content}</pre>
        </div>
      )}
    </div>
  );
}
