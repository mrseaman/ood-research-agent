import React from 'react';

const STATUS_COLORS = {
  PENDING: '#f0ad4e',
  RUNNING: '#5bc0de',
  COMPLETED: '#5cb85c',
  FAILED: '#d9534f',
  CANCELLED: '#777',
  TIMEOUT: '#d9534f',
  UNKNOWN: '#999',
};

export default function JobStatus({ status, jobId }) {
  const normalized = (status || 'UNKNOWN').toUpperCase();
  const color = STATUS_COLORS[normalized] || STATUS_COLORS.UNKNOWN;

  return (
    <span className="job-status" style={{ backgroundColor: color }}>
      {jobId && <span className="job-id">{jobId}: </span>}
      {normalized}
    </span>
  );
}
