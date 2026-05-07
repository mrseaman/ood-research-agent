import React from 'react';
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

export default function MessageBubble({ message }) {
  const { role, content, reasoning, toolCalls, toolResults, parts } = message;

  const isUser = role === 'user';

  // Use parts array for ordered rendering if available, fall back to legacy layout
  const hasParts = parts && parts.length > 0;

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
    </div>
  );
}
