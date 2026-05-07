import React, { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api';
import { t } from '../lib/i18n';

export default function FileBrowser({ onFileSelect }) {
  const [currentPath, setCurrentPath] = useState('~');
  const [entries, setEntries] = useState([]);
  const [resolvedPath, setResolvedPath] = useState('');
  const [loading, setLoading] = useState(false);

  const loadDir = async (dirPath) => {
    setLoading(true);
    try {
      const data = await apiFetch(`/api/files?path=${encodeURIComponent(dirPath)}`);
      setEntries(data.entries);
      setResolvedPath(data.path);
      setCurrentPath(dirPath);
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

  return (
    <div className="file-browser">
      <div className="file-browser-header">
        <button className="btn-small" onClick={goUp}>{t('up')}</button>
        <span className="file-browser-path" title={resolvedPath}>{resolvedPath}</span>
      </div>
      <div className="file-browser-list">
        {loading && <div>{t('loading')}</div>}
        {entries.map((e, i) => (
          <div
            key={i}
            className={`file-entry ${e.type}`}
            onClick={() => {
              if (e.type === 'directory') {
                loadDir(e.path);
              } else {
                onFileSelect?.(e.path);
              }
            }}
          >
            <span className="file-icon">{e.type === 'directory' ? '&#128193;' : '&#128196;'}</span>
            <span className="file-name">{e.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
