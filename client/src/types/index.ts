export const Role = {
  STUDENT: 'student',
  TEACHER: 'teacher',
  DEPARTMENT_HEAD: 'department_head',
  DEAN: 'dean',
  RECTOR: 'rector',
  PRESIDENT: 'president',
  ADMIN: 'admin',
} as const;

export type Role = (typeof Role)[keyof typeof Role];

export const ROLE_LABEL_KEYS: Record<Role, string> = {
  [Role.STUDENT]: 'roles.student',
  [Role.TEACHER]: 'roles.teacher',
  [Role.DEPARTMENT_HEAD]: 'roles.departmentHead',
  [Role.DEAN]: 'roles.dean',
  [Role.RECTOR]: 'roles.rector',
  [Role.PRESIDENT]: 'roles.president',
  [Role.ADMIN]: 'roles.admin',
};

export type StudentProfileStatus = 'active' | 'inactive';

export interface StudentProfileGroupRef {
  id: string;
  code?: string;
}

export interface StudentProfile {
  id: string;
  group: StudentProfileGroupRef | null;
  recordBookNumber: string;
  year: number;
  studyForm?: string;
  institute?: string;
  specialty?: string;
  status: StudentProfileStatus;
  syncedAt: string;
  /** The server sends this only to the administrator (class-transformer group `admin`). */
  externalStudentId?: string;
}

export interface StudentProfileInput {
  externalStudentId: string;
  groupId: string;
  recordBookNumber: string;
  year: number;
  studyForm?: string;
  institute?: string;
  specialty?: string;
}

export interface User {
  id: string;
  _id?: string;
  login: string;
  role: Role;
  email: string;
  phone?: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  avatarUrl?: string;
  status: 'active' | 'blocked';
  studentProfiles?: StudentProfile[];
  activeStudentProfileId?: string | null;
  teacherProfile?: {
    department: string | null;
    position: string;
    externalTeacherId?: string;
  };
  createdAt?: string;
  updatedAt?: string;
}

export type ScheduleEntryType =
  | 'lecture'
  | 'seminar'
  | 'lab'
  | 'exam'
  | 'consultation';

export type ScheduleControlType = 'exam' | 'credit' | 'coursework' | 'other';

export interface ScheduleEntry {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  courseTitle: string;
  subjectKey: string;
  type: ScheduleEntryType;
  controlType?: ScheduleControlType;
  teacherName?: string;
  classroom?: string;
  onlineFormat: boolean;
  onlineUrl?: string;
  groupCode: string;
}

export type ScheduleUnavailableReason =
  | 'no_current_term'
  | 'no_active_profile'
  | 'no_snapshot'
  | 'no_external_teacher_id';

export interface ScheduleMeta {
  term?: { id: string; academicYear: string; termNumber: number };
  fetchedAt?: string;
  stale: boolean;
  reason?: ScheduleUnavailableReason;
}

export interface ScheduleResponse {
  entries: ScheduleEntry[];
  meta: ScheduleMeta;
}

// §5.3a — a separate type, since /schedule/today returns TWO arrays, not `entries`.
export interface ScheduleTodayResponse {
  date: string;
  lessons: ScheduleEntry[];
  session: ScheduleEntry[];
  meta: ScheduleMeta;
}

// §5.3b — a flat allowlist without `meta`.
export interface ScheduleGroupResponse {
  groupCode: string;
  isExamSession: boolean;
  periodFrom: string | null;
  periodTo: string | null;
  fetchedAt: string | null;
  stale: boolean;
  entries: ScheduleEntry[];
}

export interface ScheduleRefreshSummary {
  groups: Array<{ groupCode: string; status: 'updated' | 'skipped' | 'failed'; reason?: string }>;
}

export interface OnlineLessonLink {
  _id: string;
  groupCode: string;
  subjectKey: string;
  date: string | null;
  startTime: string | null;
  url: string;
}

export interface OnlineLessonLinkInput {
  groupCode: string;
  subjectKey: string;
  date?: string;
  startTime?: string;
  url: string;
}

export interface AcademicTermRef {
  id: string;
  academicYear?: string;
  termNumber?: 1 | 2;
}

export interface AcademicTerm {
  id: string;
  academicYear: string;
  termNumber: 1 | 2;
  startsAt: string;
  endsAt: string;
  status: 'planned' | 'current' | 'closed';
  maupAcademicYear: number;
  maupSemester: number;
  activatedAt: string | null;
  closedAt: string | null;
}

export interface CreateAcademicTermInput {
  academicYear: string;
  termNumber: 1 | 2;
  startsAt: string;
  endsAt: string;
  maupAcademicYear?: number;
  maupSemester?: number;
}

export type UpdateAcademicTermInput = Partial<
  Pick<
    CreateAcademicTermInput,
    'startsAt' | 'endsAt' | 'maupAcademicYear' | 'maupSemester'
  >
>;

export interface CourseAssignment {
  id: string;
  courseId: string;
  groupId: string;
  teacherId: string;
  term: AcademicTermRef | null;
  curriculumSemester?: number | null;
  courseName?: string;
  courseCode?: string;
  credits?: number;
  source?: 'standard' | 'elective';
  teacherName?: string;
  teacher?: {
    id: string;
    firstName: string;
    lastName: string;
    middleName?: string;
    avatarUrl?: string;
  };
  groupCode?: string;
}

export type CourseStatus = 'active' | 'archived';
export type CourseResourceType = 'link' | 'video' | 'document' | 'other';

export interface CourseResource {
  id: string;
  title: string;
  type: CourseResourceType;
  url: string;
  addedAt: string;
}

export interface ResourceInput {
  title: string;
  type: CourseResourceType;
  url: string;
}

export interface CourseCatalogItem {
  id: string;
  code: string;
  name: string;
  description?: string;
  credits: number;
  externalSubjectId?: string;
  moodleUrl?: string;
  status: CourseStatus;
  departmentId: string;
  departmentName?: string;
  activeAssignmentsCount?: number;
}

export interface CourseAssignmentCard {
  id: string;
  source: 'standard' | 'elective';
  course: {
    id: string; code: string; name: string; description?: string;
    credits: number; externalSubjectId?: string; moodleUrl?: string;
    department: { id: string; name: string };
  };
  group: { id: string; code: string };
  teacher: { id: string; fullName: string } | null;
  term: { id: string; academicYear: string; termNumber: number };
  curriculumSemester?: number;
  resources: CourseResource[];
  upcomingLessons: ScheduleEntry[];
  moodleHref: string;
  canEditResources: boolean;
  canEditMoodleUrl: boolean;
  meta: { scheduleUnavailable: boolean };
}

export interface CourseCatalogFilters {
  status?: CourseStatus;
  departmentId?: string;
  page?: number;
  limit?: number;
}

export interface CreateCourseInput {
  code: string; name: string; description?: string; departmentId: string;
  credits: number; externalSubjectId?: string; moodleUrl?: string;
}
export type UpdateCourseInput = Partial<
  Pick<CreateCourseInput, 'name' | 'description' | 'credits' | 'externalSubjectId'>
>;

export interface PaginatedResponse<T> {
  docs: T[];
  totalDocs: number;
  limit: number;
  page: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface FileDto {
  id: string;
  _id?: string;
  originalName: string;
  mimetype: string;
  size: number;
}

export interface ResourceLink {
  title: string;
  url: string;
}

// exactly 5 values: 4 from plan 01 + elective (Р11). Do NOT add session/finance.
export const NOTIFICATION_TYPES = [
  'schedule_change',
  'elective',
  'new_survey',
  'announcement',
  'system',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface Notification {
  id: string;
  userId?: string | null;
  type: NotificationType | string;
  title: string;
  message: string;
  targetType?: 'all' | 'students' | 'teachers' | 'students_teachers' | 'group';
  groupId?: string | null;
  createdAt: string;
  readFlag: boolean;
  important?: boolean;
  actionUrl?: string;
  entityType?:
    | 'survey'
    | 'elective'
    | 'course'
    | 'schedule'
    | 'system'
    | string
    | null;
  entityId?: string | null;
}

export interface NotificationInput {
  title: string;
  message: string;
  type: string;
  targetType?: 'all' | 'students' | 'teachers' | 'students_teachers' | 'group';
  groupId?: string;
  actionUrl?: string;
  entityType?: string;
  entityId?: string;
  important?: boolean;
}

export const SurveyStatus = {
  DRAFT: 'draft',
  SCHEDULED: 'scheduled',
  ACTIVE: 'active',
  CLOSED: 'closed',
} as const;

export type SurveyStatus = (typeof SurveyStatus)[keyof typeof SurveyStatus];

export const SurveyTargetType = {
  ALL: 'all',
  TEACHERS: 'teachers',
  STUDENTS_TEACHERS: 'students_teachers',
  GROUPS: 'groups',
  COURSE: 'course',
} as const;

export type SurveyTargetType =
  (typeof SurveyTargetType)[keyof typeof SurveyTargetType];

export const SurveyQuestionType = {
  SINGLE: 'single',
  MULTIPLE: 'multiple',
  RATING: 'rating',
  TEXT: 'text',
} as const;

export type SurveyQuestionType =
  (typeof SurveyQuestionType)[keyof typeof SurveyQuestionType];

export interface SurveyQuestion {
  id: string;
  type: SurveyQuestionType;
  text: string;
  options: string[];
  required: boolean;
  order: number;
}

export interface Survey {
  id: string;
  title: string;
  description?: string;
  status: SurveyStatus;
  anonymous: boolean;
  targetType: SurveyTargetType;
  targetIds: string[];
  createdBy: string;
  startDate: string;
  endDate: string;
  publishedAt?: string;
  closedAt?: string;
  closedReason?: 'manual' | 'deadline';
  expectedRecipients?: number;
  estimatedMinutes?: number;
  createdAt?: string;
  updatedAt?: string;
  completed?: boolean;
  questions: SurveyQuestion[];
}

export type SurveyAnswerValue = string | string[] | number;

export interface SurveyAnswer {
  questionId: string;
  value: SurveyAnswerValue;
}

export interface SurveyMyResponse {
  completed: boolean;
  anonymous: boolean;
  response: {
    id: string;
    surveyId: string;
    answers: SurveyAnswer[];
    submittedAt: string;
  } | null;
}

export interface CreateSurveyQuestionInput {
  type: SurveyQuestionType;
  text: string;
  options?: string[];
  required?: boolean;
  order?: number;
}

export interface CreateSurveyInput {
  title: string;
  description?: string;
  anonymous?: boolean;
  targetType?: SurveyTargetType;
  targetIds?: string[];
  startDate: string;
  endDate: string;
  estimatedMinutes?: number;
  questions: CreateSurveyQuestionInput[];
}

export interface SurveySubmitInput {
  answers: SurveyAnswer[];
}

export interface ChoiceQuestionResult {
  questionId: string;
  type: typeof SurveyQuestionType.SINGLE | typeof SurveyQuestionType.MULTIPLE;
  text: string;
  required: boolean;
  order: number;
  totalAnswers: number;
  options: {
    value: string;
    count: number;
    percentage: number;
  }[];
}

export interface RatingQuestionResult {
  questionId: string;
  type: typeof SurveyQuestionType.RATING;
  text: string;
  required: boolean;
  order: number;
  totalAnswers: number;
  average: number | null;
  min: number | null;
  max: number | null;
  distribution: {
    rating: number;
    count: number;
    percentage: number;
  }[];
}

export interface TextQuestionResult {
  questionId: string;
  type: typeof SurveyQuestionType.TEXT;
  text: string;
  required: boolean;
  order: number;
  totalAnswers: number;
  answers: string[];
}

export type SurveyQuestionResult =
  | ChoiceQuestionResult
  | RatingQuestionResult
  | TextQuestionResult;

export interface SurveyResults {
  survey: Survey;
  anonymous: boolean;
  totalResponses: number;
  totalCompletions: number;
  expectedRecipients: number;
  completionRate: number;
  questions: SurveyQuestionResult[];
}

export const ElectiveDisciplineStatus = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  CANCELLED: 'cancelled',
  ARCHIVED: 'archived',
} as const;

export type ElectiveDisciplineStatus =
  (typeof ElectiveDisciplineStatus)[keyof typeof ElectiveDisciplineStatus];

export const ElectivePeriodStatus = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  CLOSED: 'closed',
  FINALIZED: 'finalized',
} as const;

export type ElectivePeriodStatus =
  (typeof ElectivePeriodStatus)[keyof typeof ElectivePeriodStatus];

export interface ReferenceView {
  id: string;
  name?: string;
  code?: string;
}

export interface ElectiveDiscipline {
  id: string;
  code: string;
  title: string;
  description?: string;
  department: ReferenceView;
  teacher?: ReferenceView | null;
  term: AcademicTermRef;
  credits: number;
  capacity: number;
  enrolledCount: number;
  availableSeats: number;
  status: ElectiveDisciplineStatus;
  cancelReason?: string;
  cancelledAt?: string;
  createdBy: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ElectivePeriod {
  id: string;
  title: string;
  term: AcademicTermRef;
  startsAt: string;
  endsAt: string;
  status: ElectivePeriodStatus;
  targetGroups: ReferenceView[];
  requiredChoices: number;
  createdBy: string;
  publishedAt?: string;
  closedAt?: string;
  finalizedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export const ElectiveSelectionStatus = {
  SELECTED: 'selected',
  CANCELLED: 'cancelled',
  ENROLLED: 'enrolled',
} as const;

export type ElectiveSelectionStatus =
  (typeof ElectiveSelectionStatus)[keyof typeof ElectiveSelectionStatus];

export interface ElectiveSelection {
  id: string;
  periodId: string;
  discipline: ElectiveDiscipline;
  student: ReferenceView;
  group: ReferenceView;
  selectedAt: string;
  status: ElectiveSelectionStatus;
  cancelReason?: 'student' | 'discipline_cancelled' | 'incomplete_set';
  cancelledAt?: string;
  courseAssignmentId?: string;
  finalizedAt?: string;
}

export type ElectivePhase = 'upcoming' | 'open' | 'closed' | 'finalized';

export interface ActiveElectivePeriod {
  period: ElectivePeriod;
  disciplines: ElectiveDiscipline[];
  selections: ElectiveSelection[];
  selectedCount: number;
  remainingChoices: number;
  phase: ElectivePhase;
}

export interface CreateElectiveDisciplineInput {
  code: string;
  title: string;
  description?: string;
  departmentId: string;
  teacherId?: string;
  termId?: string;
  credits: number;
  capacity: number;
}

export interface CreateElectivePeriodInput {
  title: string;
  termId?: string;
  startsAt: string;
  endsAt: string;
  targetGroupIds: string[];
  requiredChoices: number;
}

export interface ElectivePeriodResults {
  period: ElectivePeriod;
  totalSelections: number;
  totalStudents: number;
  expectedSelections: number;
  completionRate: number;
  disciplines: Array<{
    discipline: ElectiveDiscipline;
    selectedCount: number;
    capacity: number;
    groups: Array<{ group: ReferenceView; selectedCount: number }>;
    students: Array<{
      id: string;
      login?: string;
      fullName: string;
      group: ReferenceView;
      selectedAt: string;
    }>;
  }>;
  cancelledByDiscipline: Array<{
    discipline: ElectiveDiscipline;
    cancelledCount: number;
  }>;
}

export interface ElectivePeriodFinalization {
  period: ElectivePeriod;
  totalSelections: number;
  courseAssignments: Array<{
    id: string;
    courseId: string;
    disciplineId: string;
    groupId: string;
    studentCount: number;
  }>;
}

export type AuditLogResult = 'success' | 'failure';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  userId: string | null;
  userLogin: string;
  userRole?: Role;
  action: string;
  targetEntity?: string;
  targetId?: string;
  details?: Record<string, unknown>;
  ipAddress: string;
  userAgent: string;
  result: AuditLogResult;
  requestId?: string;
  createdAt: string;
  updatedAt: string;
}

