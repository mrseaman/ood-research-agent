import React, { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api';
import { t } from '../lib/i18n';
import FilePreview from './FilePreview';

export default function FileBrowser({ onFileSelect }) {
  const [entries, setEntries] = useState([]);
  const [resolvedPath, setResolvedPath] = useState('');
  const [pathInput, setPathInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [previewPath, setPreviewPath] = useState(null);

  const loadDir = async (dirPath) => {
    setLoading(true);
    try {
      const data = await apiFetch(`/api/files?path=${encodeURIComponent(dirPath)}`);
      setEntries(data.entries);
      setResolvedPath(data.path);
      setPathInput(data.path);
    } catch {
      setEntries([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadDir('~');
  }, []);

  const goUp = () => {
    const parent = resolvedPath.split('/').slice(0, -1).join('/') || '/';
    loadDir(parent);
  };

  const submitPath = () => {
    const p = pathInput.trim();
    if (p && p !== resolvedPath) loadDir(p);
  };

  const cwdLabel = t('cwdHint') || 'Current working dir';

  return (
    <div className="file-browser">
      <div className="file-browser-cwd-hint">{cwdLabel}</div>
      <div className="file-browser-header">
        <button className="file-browser-up" onClick={goUp} title={t('up')}>↑</button>
        <input
          className="file-browser-path-input"
          value={pathInput}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          aria-label={cwdLabel}
          title={resolvedPath}
          onChange={(e) => setPathInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); submitPath(); }
            else if (e.key === 'Escape') { setPathInput(resolvedPath); e.target.blur(); }
          }}
          onBlur={() => setPathInput(resolvedPath)}
        />
      </div>
      <div className="file-browser-list">
        {loading && <div className="sidebar-empty">{t('loading')}</div>}
        {!loading && entries.map((e, i) => (
          <div
            key={i}
            className={`file-entry ${e.type}`}
            onClick={() => {
              if (e.type === 'directory') {
                loadDir(e.path);
              } else {
                setPreviewPath(e.path);
                onFileSelect?.(e.path);
              }
            }}
            title={e.name}
          >
            <span className="file-icon" aria-hidden="true">
              {e.type === 'directory' ? '\u{1F4C1}' : '\u{1F4C4}'}
            </span>
            <span className="file-name">{e.name}</span>
          </div>
        ))}
      </div>
      {previewPath && (
        <FilePreview path={previewPath} onClose={() => setPreviewPath(null)} />
      )}
    </div>
  );
}
