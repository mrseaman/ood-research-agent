import React, { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api';
import { t } from '../lib/i18n';

function fmtNum(n) {
  if (!n) return '0';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  return String(n);
}
function fmtCost(c) {
  if (!c) return '$0.00';
  if (c < 0.01) return '<$0.01';
  return '$' + c.toFixed(2);
}
function fmtDuration(firstTs, lastTs) {
  if (!firstTs || !lastTs) return '—';
  const ms = new Date(lastTs) - new Date(firstTs);
  if (ms < 60_000) return Math.round(ms / 1000) + 's';
  if (ms < 3600_000) return Math.round(ms / 60_000) + 'm';
  return (ms / 3600_000).toFixed(1) + 'h';
}

export default function SessionInfoPanel({ open, onClose, sessionId }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !sessionId) return;
    setLoading(true);
    apiFetch(`/api/usage?session_id=${encodeURIComponent(sessionId)}&detail=session`)
      .then(setStats)
      .catch(() => setStats({ empty: true }))
      .finally(() => setLoading(false));
  }, [open, sessionId]);

  if (!open) return null;

  return (
    <div className="confirm-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="session-info-dialog">
        <div className="settings-header">
          <h3>{t('sessionInfo') || 'Session info'}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="settings-body settings-body-single">
          {loading && <div className="usage-loading">{t('loading') || 'Loading…'}</div>}
          {!loading && (!stats || stats.empty) && (
            <div className="usage-empty">{t('sessionNoUsage') || 'No usage recorded for this session yet.'}</div>
          )}
          {!loading && stats && !stats.empty && (
            <>
              <div className="usage-summary">
                <div className="usage-stat">
                  <div className="usage-stat-label">{t('messages') || 'Messages'}</div>
                  <div className="usage-stat-value">{stats.messages}</div>
                </div>
                <div className="usage-stat">
                  <div className="usage-stat-label">{t('tokensIn') || 'Tokens in'}</div>
                  <div className="usage-stat-value">{fmtNum(stats.tokensIn)}</div>
                </div>
                <div className="usage-stat">
                  <div className="usage-stat-label">{t('tokensOut') || 'Tokens out'}</div>
                  <div className="usage-stat-value">{fmtNum(stats.tokensOut)}</div>
                </div>
                <div className="usage-stat">
                  <div className="usage-stat-label">{t('cost') || 'Cost'}</div>
                  <div className="usage-stat-value">{fmtCost(stats.cost)}</div>
                </div>
                <div className="usage-stat">
                  <div className="usage-stat-label">{t('duration') || 'Duration'}</div>
                  <div className="usage-stat-value">{fmtDuration(stats.firstTs, stats.lastTs)}</div>
                </div>
                <div className="usage-stat">
                  <div className="usage-stat-label">{t('errors') || 'Errors'}</div>
                  <div className="usage-stat-value">{stats.errors}{stats.aborts ? ` / ${stats.aborts} ${t('aborts') || 'aborts'}` : ''}</div>
                </div>
              </div>

              {stats.byModel.length > 0 && (
                <div className="usage-section">
                  <div className="usage-section-title">{t('byModel') || 'By model'}</div>
                  <table className="usage-table">
                    <thead>
                      <tr>
                        <th>{t('model') || 'Model'}</th>
                        <th>{t('tokensIn') || 'In'}</th>
                        <th>{t('tokensOut') || 'Out'}</th>
                        <th>{t('cost') || 'Cost'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.byModel.map(r => (
                        <tr key={r.model}>
                          <td>{r.model}</td>
                          <td>{fmtNum(r.in)}</td>
                          <td>{fmtNum(r.out)}</td>
                          <td>{fmtCost(r.cost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {stats.byAgent.length > 1 && (
                <div className="usage-section">
                  <div className="usage-section-title">{t('byAgent') || 'By agent'}</div>
                  <table className="usage-table">
                    <thead>
                      <tr><th>{t('agent') || 'Agent'}</th><th>{t('tokensIn') || 'In'}</th><th>{t('tokensOut') || 'Out'}</th></tr>
                    </thead>
                    <tbody>
                      {stats.byAgent.map(r => (
                        <tr key={r.agent}><td>{r.agent}</td><td>{fmtNum(r.in)}</td><td>{fmtNum(r.out)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {stats.toolMix.length > 0 && (
                <div className="usage-section">
                  <div className="usage-section-title">{t('toolMix') || 'Tool usage'}</div>
                  <table className="usage-table">
                    <tbody>
                      {stats.toolMix.map(r => (
                        <tr key={r.tool}><td>{r.tool}</td><td>{r.count}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="usage-section usage-future">
                <div className="usage-section-title">{t('contextWindow') || 'Context window'}</div>
                <div className="usage-empty">{t('comingSoon') || 'Coming soon'}</div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
