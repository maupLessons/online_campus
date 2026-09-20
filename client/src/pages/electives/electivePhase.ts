import type { ElectivePhase } from '../../types';

export function getElectivePhaseView(phase: ElectivePhase) {
  switch (phase) {
    case 'open':
      return { labelKey: 'electives.phase.open', tone: 'bg-green-100 text-green-700', canSelect: true };
    case 'upcoming':
      return { labelKey: 'electives.phase.upcoming', tone: 'bg-amber-100 text-amber-800', canSelect: false };
    case 'finalized':
      return { labelKey: 'electives.phase.finalized', tone: 'bg-blue-100 text-blue-700', canSelect: false };
    default:
      return { labelKey: 'electives.phase.closed', tone: 'bg-slate-100 text-slate-600', canSelect: false };
  }
}
