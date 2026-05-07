import React, { useState } from 'react';
import { t } from '../lib/i18n';

export default function ToolCallBlock({ toolCall, result }) {
  const [expanded, setExpanded] = useState(false);
  const { name, args } = toolCall;
  const hasResult = result != null;

  const statusIcon = hasResult ? '&#10003;' : '&#9697;';
  const statusClass = hasResult ? 'tool-done' : 'tool-running';

  return (
    <div className={`tool-call-block ${statusClass}`}>
      <button
        className="tool-call-header"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="tool-status" dangerouslySetInnerHTML={{ __html: statusIcon }} />
        <span className="tool-name">{name}</span>
        {args?.path && <span className="tool-arg">{args.path}</span>}
        {args?.command && <span className="tool-arg">{args.command}</span>}
        {args?.script_path && <span className="tool-arg">{args.script_path}</span>}
        <span className="tool-expand">{expanded ? '\u25BC' : '\u25B6'}</span>
      </button>

      {expanded && (
        <div className="tool-call-detail">
          <div className="tool-section">
            <strong>{t('arguments')}</strong>
            <pre>{JSON.stringify(args, null, 2)}</pre>
          </div>
          {hasResult && (
            <div className="tool-section">
              <strong>{t('result')}</strong>
              <pre>{typeof result.result === 'string' ? result.result : JSON.stringify(result.result, null, 2)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
