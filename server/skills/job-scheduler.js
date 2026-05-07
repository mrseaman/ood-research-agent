'use strict';

module.exports = {
  name: 'job-scheduler',
  description: 'HPC job scheduling with Slurm and PBS',
  keywords: ['slurm', 'sbatch', 'squeue', 'sacct', 'sinfo', 'srun', 'pbs', 'qsub', 'qstat', 'qdel', 'job script', 'partition', 'walltime', 'nodes', 'ntasks', '#sbatch', '#pbs'],
  promptContent: `### Job Scheduling
#### Slurm
- Directives: #SBATCH --job-name, --nodes, --ntasks-per-node, --time, --partition, --account
- Commands: sbatch (submit), squeue (status), scancel (cancel), sacct (history), sinfo (cluster info)
- Array jobs: --array=1-100, %SLURM_ARRAY_TASK_ID%

#### PBS/Torque
- Directives: #PBS -N, -l nodes, -l walltime, -q, -A
- Commands: qsub (submit), qstat (status), qdel (cancel)

#### Best Practices
- Always set walltime conservatively
- Use --exclusive for performance-sensitive runs
- Module loading: module load <software>
- Redirect stdout/stderr to log files`,
};
