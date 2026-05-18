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
    groupId: string;
    recordBookNumber: string;
    year: number;
  };
  teacherProfile?: {
    departmentId: string;
    position: string;
  };
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

export interface Assignment {
  id: string;
  courseAssignmentId: string;
  title: string;
  description: string;
  dueDate: string;
  maxScore: number;
  courseName?: string;
  submission?: {
    id: string;
    status: string;
    score?: number;
    comment?: string;
    submittedAt: string;
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

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  createdAt: string;
  readFlag: boolean;
}
