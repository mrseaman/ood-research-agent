import React, { useState, useEffect } from 'react';
import { apiFetch, getBaseURI } from '../lib/api';
import { t } from '../lib/i18n';

const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp'];

export default function FilePreview({ path, onClose }) {
  const [state, setState] = useState({ loading: true });

  const name = path ? path.split('/').pop() : '';
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot).toLowerCase() : '';
  const isImage = IMAGE_EXTS.includes(ext);

  useEffect(() => {
    if (!path) return;
    if (isImage) { setState({ loading: false, kind: 'image' }); return; }
    let cancelled = false;
    setState({ loading: true });
    apiFetch(`/api/file?path=${encodeURIComponent(path)}`)
      .then(d => { if (!cancelled) setState({ loading: false, ...d }); })
      .catch(e => { if (!cancelled) setState({ loading: false, kind: 'error', error: e.message }); });
    return () => { cancelled = true; };
  }, [path, isImage]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!path) return null;

  const imgUrl = `${getBaseURI()}/api/image?path=${encodeURIComponent(path)}`;
  const { loading, kind, content, truncated, error } = state;

  return (
    <div className="preview-overlay" onClick={onClose}>
      <div className="preview-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="preview-header">
          <span className="preview-name" title={path}>{name}</span>
          <button
            className="preview-close"
            onClick={onClose}
            title={t('close') || 'Close'}
            aria-label={t('close') || 'Close'}
          >×</button>
        </div>
        <div className="preview-body">
          {loading && <div className="preview-msg">{t('loading')}</div>}
          {!loading && isImage && (
            <img className="preview-img" src={imgUrl} alt={name} />
          )}
          {!loading && kind === 'text' && (
            <pre className="preview-pre">{content || (t('emptyFile') || '(empty file)')}</pre>
          )}
          {!loading && kind === 'binary' && (
            <div className="preview-msg">{t('binaryFile') || 'Binary file — preview not available.'}</div>
          )}
          {!loading && kind === 'error' && (
            <div className="preview-msg">{(t('error') || 'Error:')} {error}</div>
          )}
        </div>
        {!loading && kind === 'text' && truncated && (
          <div className="preview-foot">
            {t('previewTruncated') || 'Preview truncated — file exceeds the size limit.'}
          </div>
        )}
      </div>
    </div>
  );
}
