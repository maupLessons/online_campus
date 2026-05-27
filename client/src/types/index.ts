export const Role = {
  STUDENT: 'student',
  TEACHER: 'teacher',
  DISPATCHER: 'dispatcher',
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
  [Role.DISPATCHER]: 'roles.dispatcher',
  [Role.DEPARTMENT_HEAD]: 'roles.departmentHead',
  [Role.DEAN]: 'roles.dean',
  [Role.RECTOR]: 'roles.rector',
  [Role.PRESIDENT]: 'roles.president',
  [Role.ADMIN]: 'roles.admin',
};
export const ROLE_LABELS: Record<Role, string> = {
  [Role.STUDENT]: 'Студент',
  [Role.TEACHER]: 'Викладач',
  [Role.DISPATCHER]: 'Диспетчер',
  [Role.DEPARTMENT_HEAD]: 'Зав. кафедри',
  [Role.DEAN]: 'Декан',
  [Role.RECTOR]: 'Ректор',
  [Role.PRESIDENT]: 'Президент',
  [Role.ADMIN]: 'Адмін',
};

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
  studentProfile?: {
    group: string | null;
    recordBookNumber: string;
    year: number;
  };
  teacherProfile?: {
    department: string | null;
    position: string;
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface ScheduleEntry {
  id: string;
  courseAssignmentId: string;
  classroomId?: string;
  date: string;
  startTime: string;
  endTime: string;
  type: string;
  status: string;
  courseName?: string;
  courseCode?: string;
  groupCode?: string;
  teacherId?: string;
  classroom?: string;
}

export interface CourseAssignment {
  id: string;
  courseId: string;
  groupId: string;
  teacherId: string;
  academicYear: string;
  semester: number;
  courseName?: string;
  courseCode?: string;
  credits?: number;
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

export interface Material {
  id: string;
  courseAssignmentId?: string;
  title: string;
  description?: string;
  files?: FileDto[];
  fileLink?: string;
  originalName?: string;
  publishDate: string;
  createdAt?: string;
}

export interface Assignment {
  id: string;
  courseAssignmentId: string;
  title: string;
  description: string;
  files: FileDto[];
  dueDate: string;
  maxScore: number;
  courseName?: string;
  submission?: {
    id: string;
    assignmentId: string;
    studentId: string;
    files: FileDto[];
    submittedAt: string;
    status: string;
    score?: number;
    comment?: string;
    fileLink: string;
    originalName: string;
  } | null;
}

export interface StudentCourse {
  courseAssignmentId: string;
  courseName: string;
  courseCode: string;
  academicYear: string;
  semester: number;
}

export interface Grade {
  id: string;
  studentId: string;
  courseAssignmentId: string;
  date: string;
  type: string;
  value: number;
  comment?: string;
  courseName?: string;
  courseCode?: string;
}

export interface GradeJournalResponse {
  studentId: string;
  studentName: string;
  grades: Grade[];
}

export interface Notification {
  id: string;
  userId?: string | null;
  type: string;
  title: string;
  message: string;
  targetType?: 'all' | 'students' | 'teachers' | 'students_teachers' | 'group';
  groupId?: string | null;
  createdAt: string;
  readFlag: boolean;
  important?: boolean;
  actionUrl?: string;
  entityType?: string | null;
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
  startDate?: string;
  endDate?: string;
  publishedAt?: string;
  closedAt?: string;
  createdAt?: string;
  updatedAt?: string;
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
  startDate?: string;
  endDate?: string;
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
  questions: SurveyQuestionResult[];
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

export interface Submission {
  id: string;
  assignmentId: string;
  studentId: string;
  submittedAt: string;
  fileLink: string;
  originalName: string;
  score?: number;
  comment?: string;
  status: 'submitted' | 'graded' | 'returned';
}
