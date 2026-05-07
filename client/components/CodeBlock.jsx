import React, { useState } from 'react';
import { t } from '../lib/i18n';

export default function CodeBlock({ language, code }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="code-block">
      <div className="code-header">
        <span className="code-lang">{language || 'text'}</span>
        <button className="btn-small" onClick={handleCopy}>
          {copied ? t('copied') : t('copy')}
        </button>
      </div>
      <pre><code>{code}</code></pre>
    </div>
  );
}
