'use strict';

const { getSoftwarePrompt } = require('../cluster-config');

const softwarePrompt = getSoftwarePrompt();

module.exports = {
  name: 'cluster-env',
  description: 'Cluster environment — available software, modules, and paths',
  keywords: [
    'module', 'software', 'install', 'version', 'available',
    'compile', 'build', 'run', 'execute', 'simulation', 'compute',
    'vasp', 'gaussian', 'lammps', 'gromacs', 'cp2k', 'python', 'conda',
    'submit', 'job', 'sbatch', 'slurm',
  ],
  promptContent: softwarePrompt
    ? `### Cluster Software Environment\n\nThe following software is available on this cluster:\n\n${softwarePrompt}\n\nFor module-based software, use \`module load name/version\` in job scripts. For software with a path, add the path to PATH or use the absolute path.`
    : '',
};
