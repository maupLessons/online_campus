export enum ScheduleEntryType {
  LECTURE = 'lecture',
  SEMINAR = 'seminar',
  LAB = 'lab',
  EXAM = 'exam',
  CONSULTATION = 'consultation',
}

export enum ScheduleEntryStatus {
  SCHEDULED = 'scheduled',
  CANCELLED = 'cancelled',
  RESCHEDULED = 'rescheduled',
  SUBSTITUTED = 'substituted',
}

export enum ScheduleChangeAction {
  CREATED = 'created',
  UPDATED = 'updated',
  CANCELLED = 'cancelled',
  RESCHEDULED = 'rescheduled',
  SUBSTITUTED = 'substituted',
  DELETED = 'deleted',
}
