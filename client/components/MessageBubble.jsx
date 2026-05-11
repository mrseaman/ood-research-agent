import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ThinkingBlock from './ThinkingBlock';
import ToolCallBlock from './ToolCallBlock';
import CodeBlock from './CodeBlock';
import { t } from '../lib/i18n';

function MarkdownContent({ content }) {
  if (!content) return null;
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ node, inline, className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '');
          const lang = match ? match[1] : '';
          const code = String(children).replace(/\n$/, '');

          if (!inline && code.includes('\n')) {
            return <CodeBlock language={lang} code={code} />;
          }
          return <code className={className} {...props}>{children}</code>;
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

function extractText(message) {
  const { role, content, parts } = message;
  if (role === 'user') return content || '';
  if (parts && parts.length > 0) {
    return parts
      .filter(p => p.type === 'content')
      .map(p => p.content)
      .join('')
      || content
      || '';
  }
  return content || '';
}

function downloadMarkdown(text, role) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `${role}-${stamp}.md`;
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function MessageActions({ message }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const text = extractText(message);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for non-secure contexts
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch {}
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleDownload = () => {
    const text = extractText(message);
    if (!text) return;
    downloadMarkdown(text, message.role);
  };

  return (
    <div className="message-actions">
      <button
        type="button"
        className="msg-action-btn"
        onClick={handleCopy}
        title={copied ? t('copied') : t('copy')}
        aria-label={t('copy')}
      >
        {copied ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
        )}
      </button>
      <button
        type="button"
        className="msg-action-btn"
        onClick={handleDownload}
        title={t('download')}
        aria-label={t('download')}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
      </button>
    </div>
  );
}

export default function MessageBubble({ message }) {
  const { role, content, reasoning, toolCalls, toolResults, parts } = message;
  const isUser = role === 'user';
  const hasParts = parts && parts.length > 0;
  const hasContent = hasParts ? parts.some(p => p.content || p.toolCall) : !!(content || reasoning || (toolCalls && toolCalls.length));

  return (
    <div className={`message ${isUser ? 'message-user' : 'message-assistant'}`}>
      <div className="message-label">{isUser ? t('you') : t('assistant')}</div>
      <div className="message-body">
        {hasParts ? (
          parts.map((part, i) => {
            switch (part.type) {
              case 'reasoning':
                return <ThinkingBlock key={`r-${i}`} content={part.content} />;
              case 'toolCall':
                return (
                  <div className="tool-calls" key={`tc-${part.toolCall?.id || i}`}>
                    <ToolCallBlock
                      toolCall={part.toolCall}
                      result={part.result}
                    />
                  </div>
                );
              case 'content':
                return <MarkdownContent key={`c-${i}`} content={part.content} />;
              default:
                return null;
            }
          })
        ) : (
          <>
            {reasoning && <ThinkingBlock content={reasoning} />}
            {toolCalls && toolCalls.length > 0 && (
              <div className="tool-calls">
                {toolCalls.map((tc, i) => (
                  <ToolCallBlock
                    key={tc.id || i}
                    toolCall={tc}
                    result={toolResults?.[tc.id]}
                  />
                ))}
              </div>
            )}
            <MarkdownContent content={content} />
          </>
        )}
      </div>
      {hasContent && <MessageActions message={message} />}
    </div>
  );
}
