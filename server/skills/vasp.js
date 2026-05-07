'use strict';

module.exports = {
  name: 'vasp',
  description: 'VASP (Vienna Ab initio Simulation Package) — DFT',
  keywords: ['vasp', 'incar', 'poscar', 'potcar', 'kpoints', 'outcar', 'contcar', 'oszicar', 'vasprun', 'eigenval', 'doscar', 'chgcar', 'dft', 'density functional', 'encut', 'ismear', 'ibrion', 'isif', 'ediff', 'ediffg', 'ncore', 'npar', 'kpoint'],
  promptContent: `### VASP (Vienna Ab initio Simulation Package)
- Key input files: INCAR (parameters), POSCAR (structure), POTCAR (pseudopotentials), KPOINTS (k-mesh)
- Common INCAR parameters: ENCUT, ISMEAR, SIGMA, EDIFF, EDIFFG, NSW, IBRION, ISIF, PREC, ALGO, LREAL, NCORE/NPAR
- Output files: OUTCAR, CONTCAR, OSZICAR, vasprun.xml, EIGENVAL, DOSCAR, CHGCAR
- Best practices: convergence testing for ENCUT and KPOINTS, appropriate ISMEAR for metals vs insulators
- Relaxation: IBRION=2 (CG), ISIF=2 (ions only) or ISIF=3 (cell+ions), NSW>0
- Electronic: ALGO=Normal or Fast, PREC=Accurate, LREAL=Auto for large systems
- Parallelization: NCORE = sqrt(total_cores), or NPAR = total_cores/NCORE`,
};
