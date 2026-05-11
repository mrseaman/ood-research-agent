import React, { useState } from 'react';
import { t } from '../lib/i18n';
import { getBaseURI } from '../lib/api';

export default function ToolCallBlock({ toolCall, result }) {
  const [expanded, setExpanded] = useState(false);
  const { name, args } = toolCall;
  const hasResult = result != null;

  const statusIcon = hasResult ? '&#10003;' : '&#9697;';
  const statusClass = hasResult ? 'tool-done' : 'tool-running';

  const isImage = name === 'display_image';
  const resultStr = hasResult ? (typeof result.result === 'string' ? result.result : JSON.stringify(result.result)) : '';
  const imageOk = isImage && hasResult && args?.path && !resultStr.startsWith('Error');
  const imageUrl = imageOk
    ? `${getBaseURI()}/api/image?path=${encodeURIComponent(args.path)}`
    : null;

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
        <span className="tool-expand">{expanded ? '▼' : '▶'}</span>
      </button>

      {imageOk && (
        <figure className="tool-image">
          <img src={imageUrl} alt={args.caption || args.path} loading="lazy" />
          {args.caption && <figcaption>{args.caption}</figcaption>}
        </figure>
      )}

      {expanded && (
        <div className="tool-call-detail">
          <div className="tool-section">
            <strong>{t('arguments')}</strong>
            <pre>{JSON.stringify(args, null, 2)}</pre>
          </div>
          {hasResult && (
            <div className="tool-section">
              <strong>{t('result')}</strong>
              <pre>{resultStr}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
