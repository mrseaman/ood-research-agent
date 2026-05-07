'use strict';

module.exports = {
  name: 'gromacs',
  description: 'GROMACS — Molecular Dynamics for biomolecular systems',
  keywords: ['gromacs', 'gmx', 'gro', 'top', 'topology', 'mdp', 'ndx', 'pdb2gmx', 'editconf', 'solvate', 'genion', 'grompp', 'mdrun', 'tcoupl', 'pcoupl', 'coulombtype', 'integrator'],
  promptContent: `### GROMACS
- Key files: .gro (structure), .top (topology), .mdp (parameters), .ndx (index groups)
- Workflow: pdb2gmx → editconf → solvate → genion → grompp → mdrun
- Common .mdp parameters: integrator, dt, nsteps, tcoupl, pcoupl, coulombtype, rcoulomb, rvdw
- Best practices: energy minimization before dynamics, proper equilibration (NVT then NPT)
- Force fields: AMBER, CHARMM, OPLS-AA, GROMOS
- Analysis: gmx energy, gmx rms, gmx rdf, gmx msd`,
};
