export enum ElectiveDisciplineStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  CANCELLED = 'cancelled',
  ARCHIVED = 'archived',
}

export enum ElectiveSelectionPeriodStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  CLOSED = 'closed',
  FINALIZED = 'finalized',
}

export enum ElectiveSelectionStatus {
  SELECTED = 'selected',
  CANCELLED = 'cancelled',
  ENROLLED = 'enrolled',
}

export const ELECTIVE_SELECTION_CANCEL_REASONS = [
  'student',
  'discipline_cancelled',
  'incomplete_set',
] as const;
export type ElectiveSelectionCancelReason =
  (typeof ELECTIVE_SELECTION_CANCEL_REASONS)[number];

export const ACTIVE_SELECTION_STATUSES = [
  ElectiveSelectionStatus.SELECTED,
  ElectiveSelectionStatus.ENROLLED,
] as const;
