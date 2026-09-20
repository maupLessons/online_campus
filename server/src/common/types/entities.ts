import { Role } from './roles.enum';

export interface User {
  id: string;
  login: string;
  passwordHash: string;
  role: Role;
  email: string;
  phone?: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  avatarUrl?: string;
  status: 'active' | 'blocked';
  createdAt: string;
}

export interface StudentProfile {
  userId: string;
  externalStudentId: string;
  groupId: string;
  recordBookNumber: string;
  year: number;
  studyForm?: string;
  institute?: string;
  specialty?: string;
}

export interface TeacherProfile {
  userId: string;
  departmentId: string;
  position: string;
  externalTeacherId?: string;
}

export interface Group {
  id: string;
  code: string;
  specialty: string;
  course: number;
  curator?: string;
}

export interface Department {
  id: string;
  name: string;
  facultyId: string;
  headUserId?: string;
}

export interface Faculty {
  id: string;
  name: string;
  deanUserId?: string;
}

export interface Specialty {
  id: string;
  name: string;
  code: string;
}

export interface Course {
  id: string;
  name: string;
  code: string;
  departmentId: string;
  credits: number;
  description?: string;
  externalSubjectId?: string;
  moodleUrl?: string;
  status: 'active' | 'archived';
  createdBy: string;
}

export interface CourseAssignment {
  id: string;
  courseId: string;
  groupId: string;
  teacherId: string;
  termId: string;
}

export interface AcademicTermSeed {
  id: string;
  academicYear: string;
  termNumber: 1 | 2;
  startsAt: string;
  endsAt: string;
  status: 'planned' | 'current' | 'closed';
  maupAcademicYear: number;
  maupSemester: number;
}

export interface Classroom {
  id: string;
  building: string;
  roomNumber: string;
  capacity: number;
  type: 'lecture' | 'lab' | 'seminar' | 'online';
}

export interface Notification {
  id: string;
  userId: string;
  type: 'schedule_change' | 'new_survey' | 'announcement' | 'system';
  title: string;
  message: string;
  createdAt: string;
  readFlag: boolean;
  important?: boolean;
  actionUrl?: string;
  entityType?: string | null;
  entityId?: string | null;
}
