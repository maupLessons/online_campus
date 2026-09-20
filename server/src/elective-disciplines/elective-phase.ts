import { ElectiveSelectionPeriodStatus } from './schemas/elective.enums';

export type ElectivePhase = 'upcoming' | 'open' | 'closed' | 'finalized';

export function computeElectivePhase(
  period: {
    status: ElectiveSelectionPeriodStatus;
    startsAt: Date;
    endsAt: Date;
  },
  now: Date,
): ElectivePhase {
  if (period.status === ElectiveSelectionPeriodStatus.FINALIZED)
    return 'finalized';
  if (period.status === ElectiveSelectionPeriodStatus.CLOSED) return 'closed';
  if (now < period.startsAt) return 'upcoming';
  if (now > period.endsAt) return 'closed';
  return 'open';
}
