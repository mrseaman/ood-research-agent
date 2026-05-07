'use strict';

const { execFile } = require('child_process');
const config = require('../config');
const { validatePath } = require('./file-ops');

function execPromise(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 30000, ...options }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`${cmd} failed: ${err.message}\nstderr: ${stderr}`));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

async function submitJob({ script_path, scheduler }) {
  const resolved = validatePath(script_path);
  const sched = scheduler || config.scheduler;

  if (sched === 'slurm') {
    const output = await execPromise('sbatch', [resolved]);
    const match = output.match(/(\d+)/);
    const jobId = match ? match[1] : null;
    return jobId
      ? `Job submitted successfully. Job ID: ${jobId}\nFull output: ${output}`
      : `Submission output: ${output}`;
  } else if (sched === 'pbs') {
    const output = await execPromise('qsub', [resolved]);
    return `Job submitted successfully. Job ID: ${output}`;
  } else {
    throw new Error(`Unknown scheduler: ${sched}`);
  }
}

async function checkJob({ job_id, scheduler }) {
  const sched = scheduler || config.scheduler;
  const sanitizedId = String(job_id).replace(/[^0-9._\-\[\]]/g, '');

  if (sched === 'slurm') {
    try {
      const output = await execPromise('squeue', ['-j', sanitizedId, '--format=%i %j %T %M %l %D %R', '--noheader']);
      return output || `Job ${sanitizedId} not found in queue (may have completed).`;
    } catch {
      // try sacct for completed jobs
      try {
        const output = await execPromise('sacct', ['-j', sanitizedId, '--format=JobID,JobName,State,ExitCode,Elapsed', '--noheader', '--parsable2']);
        return output || `Job ${sanitizedId} not found.`;
      } catch {
        return `Job ${sanitizedId} not found in queue or accounting.`;
      }
    }
  } else if (sched === 'pbs') {
    try {
      const output = await execPromise('qstat', [sanitizedId]);
      return output;
    } catch {
      return `Job ${sanitizedId} not found or completed.`;
    }
  } else {
    throw new Error(`Unknown scheduler: ${sched}`);
  }
}

module.exports = { submitJob, checkJob };
