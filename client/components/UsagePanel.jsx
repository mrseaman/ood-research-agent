import React, { useState, useEffect, useCallback } from 'react';
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

function fmtPct(p) {
  return (p * 100).toFixed(1) + '%';
}

function Sparkline({ values, max, height = 28, color = 'var(--accent, #4c8bf5)' }) {
  if (!values.length) return null;
  const m = max || Math.max(1, ...values);
  const w = 240;
  const bw = w / values.length;
  return (
    <svg width={w} height={height} className="sparkline">
      {values.map((v, i) => {
        const h = (v / m) * (height - 2);
        return (
          <rect
            key={i}
            x={i * bw + 1}
            y={height - h}
            width={Math.max(1, bw - 2)}
            height={h}
            fill={color}
            opacity={v > 0 ? 0.85 : 0.15}
          />
        );
      })}
    </svg>
  );
}

export default function UsagePanel() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const d = await apiFetch(`/api/usage?days=${days}`);
      setData(d);
    } catch (e) {
      setErr(e.message);
    }
    setLoading(false);
  }, [days]);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) return <div className="usage-loading">{t('loading') || 'Loading…'}</div>;
  if (err) return <div className="settings-error">{err}</div>;
  if (!data) return null;

  const dayLabels = data.messagesPerDay.map(d => d.date);
  const msgCounts = data.messagesPerDay.map(d => d.count);
  const tokensByDay = dayLabels.map(d => {
    const rows = data.tokensPerDayPerModel.filter(r => r.date === d);
    return rows.reduce((s, r) => s + r.in + r.out, 0);
  });

  return (
    <div className="usage-panel">
      <div className="usage-controls">
        {[7, 30, 90].map(n => (
          <button
            key={n}
            className={`usage-range ${n === days ? 'active' : ''}`}
            onClick={() => setDays(n)}
          >
            {n}d
          </button>
        ))}
        <button className="usage-range" onClick={load}>{t('refresh') || 'Refresh'}</button>
      </div>

      <div className="usage-summary">
        <div className="usage-stat">
          <div className="usage-stat-label">{t('messages') || 'Messages'}</div>
          <div className="usage-stat-value">{fmtNum(data.totalMessages)}</div>
        </div>
        <div className="usage-stat">
          <div className="usage-stat-label">{t('tokensIn') || 'Tokens in'}</div>
          <div className="usage-stat-value">{fmtNum(data.totalTokensIn)}</div>
        </div>
        <div className="usage-stat">
          <div className="usage-stat-label">{t('tokensOut') || 'Tokens out'}</div>
          <div className="usage-stat-value">{fmtNum(data.totalTokensOut)}</div>
        </div>
        <div className="usage-stat">
          <div className="usage-stat-label">{t('costEstimate') || 'Cost'}</div>
          <div className="usage-stat-value">{fmtCost(data.cost.total)}</div>
        </div>
        <div className="usage-stat">
          <div className="usage-stat-label">{t('errorRate') || 'Error rate'}</div>
          <div className="usage-stat-value">{fmtPct(data.errors.rate)}</div>
        </div>
        <div className="usage-stat">
          <div className="usage-stat-label">{t('aborts') || 'Aborts'}</div>
          <div className="usage-stat-value">{data.aborts}</div>
        </div>
      </div>

      <div className="usage-section">
        <div className="usage-section-title">{t('messagesPerDay') || 'Messages per day'}</div>
        <Sparkline values={msgCounts} />
      </div>

      <div className="usage-section">
        <div className="usage-section-title">{t('tokensPerDay') || 'Tokens per day (in + out)'}</div>
        <Sparkline values={tokensByDay} color="var(--accent-2, #38bdf8)" />
      </div>

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
            {data.cost.byModel.length === 0 && (
              <tr><td colSpan="4" className="usage-empty">{t('noData') || 'No data'}</td></tr>
            )}
            {data.cost.byModel.map(r => (
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

      {data.tokensByAgent.length > 1 && (
        <div className="usage-section">
          <div className="usage-section-title">{t('byAgent') || 'By agent (multi-mode)'}</div>
          <table className="usage-table">
            <thead>
              <tr>
                <th>{t('agent') || 'Agent'}</th>
                <th>{t('tokensIn') || 'In'}</th>
                <th>{t('tokensOut') || 'Out'}</th>
              </tr>
            </thead>
            <tbody>
              {data.tokensByAgent.map(r => (
                <tr key={r.agent}>
                  <td>{r.agent}</td>
                  <td>{fmtNum(r.in)}</td>
                  <td>{fmtNum(r.out)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="usage-section">
        <div className="usage-section-title">{t('toolMix') || 'Tool usage'}</div>
        <table className="usage-table">
          <tbody>
            {data.toolMix.length === 0 && (
              <tr><td colSpan="2" className="usage-empty">{t('noData') || 'No data'}</td></tr>
            )}
            {data.toolMix.map(r => (
              <tr key={r.tool}>
                <td>{r.tool}</td>
                <td>{r.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.errors.total > 0 && (
        <div className="usage-section">
          <div className="usage-section-title">{t('errors') || 'Errors'}</div>
          <table className="usage-table">
            <tbody>
              {data.errors.byKind.map(r => (
                <tr key={r.kind}><td>{r.kind}</td><td>{r.count}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
