'use strict';

module.exports = {
  name: 'lammps',
  description: 'LAMMPS (Large-scale Atomic/Molecular Massively Parallel Simulator) — MD',
  keywords: ['lammps', 'lmp', 'pair_style', 'atom_style', 'fix npt', 'fix nvt', 'fix nve', 'eam', 'tersoff', 'reaxff', 'airebo', 'lj/cut', 'dump', 'thermo', 'data file', 'molecular dynamics'],
  promptContent: `### LAMMPS (Large-scale Atomic/Molecular Massively Parallel Simulator)
- Input script syntax: units, atom_style, pair_style, fix, compute, thermo, dump, run
- Common force fields: EAM, Tersoff, ReaxFF, AIREBO, LJ/cut
- Data file format: atoms, bonds, angles, dihedrals sections
- Best practices: timestep selection, thermostat/barostat choices, equilibration protocols
- Typical workflow: define box → read data → set potentials → minimize → equilibrate → production run
- Common units: metal (Å, eV, ps), real (Å, kcal/mol, fs), si (m, J, s)`,
};
