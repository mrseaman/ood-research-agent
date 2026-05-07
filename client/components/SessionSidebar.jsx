import React, { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api';
import { t } from '../lib/i18n';

export default function SessionSidebar({ currentId, onSelect, onClose }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/sessions')
      .then(setSessions)
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    try {
      await apiFetch(`/api/sessions/${id}`, { method: 'DELETE' });
      setSessions(prev => prev.filter(s => s.id !== id));
    } catch {
      // ignore
    }
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h3>{t('sessions')}</h3>
        <button className="btn-icon" onClick={onClose}>&times;</button>
      </div>
      <div className="sidebar-list">
        {loading && <div className="sidebar-empty">{t('loading')}</div>}
        {!loading && sessions.length === 0 && (
          <div className="sidebar-empty">{t('noSessions')}</div>
        )}
        {sessions.map(s => (
          <div
            key={s.id}
            className={`sidebar-item ${s.id === currentId ? 'active' : ''}`}
            onClick={() => onSelect(s.id)}
          >
            <span className="session-title">{s.title}</span>
            <button className="btn-delete" onClick={(e) => handleDelete(e, s.id)}>
              &times;
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}
