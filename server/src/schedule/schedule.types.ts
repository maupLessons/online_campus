import { Types } from 'mongoose';
import { ScheduleEntryDto } from './dto';
import { ScheduleEntryStatus, ScheduleEntryType } from './schedule.enums';
import { ScheduleChangeHistory } from './schemas';
import { ScheduleTemplateStatus } from './schemas';

export type EntityObject = { _id?: unknown; id?: unknown };
export type EntityRef = Types.ObjectId | string | EntityObject;

export type CourseLean = EntityObject & {
  name?: string;
  code?: string;
};

export type GroupLean = EntityObject & {
  code?: string;
};

export type UserLean = EntityObject & {
  firstName?: string;
  lastName?: string;
  middleName?: string;
};

export type ClassroomLean = EntityObject & {
  building?: string;
  roomNumber?: string;
};

export type CourseAssignmentLean = EntityObject & {
  course?: CourseLean | EntityRef;
  group?: GroupLean | EntityRef;
  teacher?: UserLean | EntityRef;
};

export type ScheduleEntryLean = {
  _id: unknown;
  courseAssignment?: CourseAssignmentLean | EntityRef;
  classroom?: ClassroomLean | EntityRef | null;
  date: Date | string;
  startTime: string;
  endTime: string;
  type: ScheduleEntryType;
  status: ScheduleEntryStatus;
  changeReason?: string;
  cancelledAt?: Date;
  rescheduledAt?: Date;
  substitutedAt?: Date;
  changeHistory?: ScheduleChangeHistory[];
  createdAt?: Date;
  updatedAt?: Date;
};

export type ScheduleTemplateLean = {
  _id: unknown;
  title: string;
  courseAssignment?: CourseAssignmentLean | EntityRef;
  classroom?: ClassroomLean | EntityRef | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  type: ScheduleEntryType;
  status: ScheduleTemplateStatus;
  createdAt?: Date;
  updatedAt?: Date;
};

export type NormalizedSchedulePayload = {
  courseAssignmentId: string;
  classroomId?: string;
  date: Date;
  dateString: string;
  startTime: string;
  endTime: string;
  type: ScheduleEntryType;
  status: ScheduleEntryStatus;
  assignment: CourseAssignmentLean;
};

export type ScheduleConflictType = 'teacher' | 'classroom' | 'group';

export type ScheduleConflict = {
  type: ScheduleConflictType;
  entryId: string;
  date: string;
  startTime: string;
  endTime: string;
  message: string;
};

export type ScheduleNotificationAction =
  | 'created'
  | 'updated'
  | 'cancelled'
  | 'rescheduled'
  | 'substituted'
  | 'deleted';

export type ScheduleFilter = Record<string, unknown>;
export type CourseAssignmentFilter = Record<string, unknown>;

export type ScheduleBulkItemResult = {
  index?: number;
  id?: string;
  success: boolean;
  entry?: ScheduleEntryDto;
  error?: string;
  conflicts?: ScheduleConflict[];
};

export type ScheduleBulkOperationResult = {
  dryRun: boolean;
  created?: number;
  updated?: number;
  cancelled?: number;
  skipped: number;
  items: ScheduleBulkItemResult[];
};
