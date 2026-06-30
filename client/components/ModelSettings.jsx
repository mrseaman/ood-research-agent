import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api';
import { t } from '../lib/i18n';
import UsagePanel from './UsagePanel';
import SetupGuide from './SetupGuide';

const emptyForm = {
  id: '',
  name: '',
  endpoint: '',
  model: '',
  token: '',
  useProxy: false,
};

export default function ModelSettings({ open, onClose, onChanged }) {
  const [models, setModels] = useState([]);
  const [editing, setEditing] = useState(null); // existing model being edited, or null
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('models'); // 'models' | 'usage'

  const refresh = useCallback(async () => {
    try {
      const data = await apiFetch('/api/user-models');
      setModels(data.models || []);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => { if (open) { refresh(); setError(''); } }, [open, refresh]);

  if (!open) return null;

  const startNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setError('');
  };
  const startEdit = (m) => {
    setEditing(m);
    setForm({
      id: m.id,
      name: m.name,
      endpoint: m.endpoint,
      model: m.model,
      token: '', // require re-enter only if changing
      useProxy: !!m.useProxy,
    });
    setError('');
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body = { ...form };
      // If editing and token field left blank, don't overwrite the stored one.
      if (editing && !form.token) delete body.token;
      await apiFetch('/api/user-models', { method: 'POST', body: JSON.stringify(body) });
      await refresh();
      onChanged?.();
      startNew();
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  const handleDelete = async (id) => {
    if (!confirm(t('confirmDeleteModel') || `Delete model "${id}"?`)) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/user-models/${encodeURIComponent(id)}`, { method: 'DELETE' });
      await refresh();
      onChanged?.();
      if (editing && editing.id === id) startNew();
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  return (
    <div className="confirm-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="settings-dialog">
        <div className="settings-header">
          <h3>{t('settings') || 'Settings'}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="settings-tabs">
          <button
            className={`settings-tab ${tab === 'models' ? 'active' : ''}`}
            onClick={() => setTab('models')}
          >{t('modelsTab') || 'Models'}</button>
          <button
            className={`settings-tab ${tab === 'usage' ? 'active' : ''}`}
            onClick={() => setTab('usage')}
          >{t('usageTab') || 'Usage'}</button>
          <button
            className={`settings-tab ${tab === 'guide' ? 'active' : ''}`}
            onClick={() => setTab('guide')}
          >{t('guideTab') || 'Setup Guide'}</button>
        </div>

        {tab === 'guide' ? (
          <div className="settings-body settings-body-single">
            <SetupGuide />
          </div>
        ) : tab === 'usage' ? (
          <div className="settings-body settings-body-single">
            <UsagePanel />
          </div>
        ) : (
        <div className="settings-body">
          <div className="settings-list">
            {models.length === 0 && <div className="sidebar-empty">{t('noUserModels') || 'No user models added yet'}</div>}
            {models.map(m => (
              <div key={m.id} className={`settings-item ${editing && editing.id === m.id ? 'active' : ''}`}>
                <div className="settings-item-text" onClick={() => startEdit(m)}>
                  <div className="settings-item-name">{m.name}</div>
                  <div className="settings-item-sub">{m.model} · {m.endpoint.replace(/^https?:\/\//, '')}</div>
                </div>
                <button className="btn-delete" onClick={() => handleDelete(m.id)} aria-label="Delete">×</button>
              </div>
            ))}
            <button className="sidebar-new-chat" onClick={startNew}>
              + {t('addModel') || 'Add Model'}
            </button>
          </div>

          <form className="settings-form" onSubmit={handleSave}>
            <label>
              <span>{t('modelDisplayName') || 'Display Name'}</span>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="My OpenAI"
                required
              />
            </label>
            <label>
              <span>{t('endpoint') || 'Endpoint URL'}</span>
              <input
                type="url"
                value={form.endpoint}
                onChange={(e) => setForm({ ...form, endpoint: e.target.value })}
                placeholder="https://api.openai.com/v1/chat/completions"
                required
              />
            </label>
            <label>
              <span>{t('modelName') || 'Model Name'}</span>
              <input
                type="text"
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                placeholder="gpt-4o"
                required
              />
            </label>
            <label>
              <span>{t('token') || 'API Token'}{editing ? ` (${t('leaveBlankToKeep') || 'leave blank to keep'})` : ''}</span>
              <input
                type="password"
                value={form.token}
                onChange={(e) => setForm({ ...form, token: e.target.value })}
                placeholder={editing && editing.hasToken ? '••••••••' : 'sk-...'}
                autoComplete="new-password"
              />
            </label>
            <label className="settings-checkbox">
              <input
                type="checkbox"
                checked={form.useProxy}
                onChange={(e) => setForm({ ...form, useProxy: e.target.checked })}
              />
              <span>{t('useProxy') || 'Route Through HTTP Proxy'}</span>
            </label>

            {error && <div className="settings-error">{error}</div>}

            <div className="settings-actions">
              <button type="submit" className="btn-approve" disabled={busy}>
                {editing ? (t('save') || 'Save') : (t('add') || 'Add')}
              </button>
              {editing && (
                <button type="button" className="btn-deny" onClick={startNew} disabled={busy}>
                  {t('cancel') || 'Cancel'}
                </button>
              )}
            </div>
          </form>
        </div>
        )}
      </div>
    </div>
  );
}
