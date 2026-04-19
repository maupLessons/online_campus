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
  groupId: string;
  recordBookNumber: string;
  year: number;
}

export interface TeacherProfile {
  userId: string;
  departmentId: string;
  position: string;
}

export interface Group {
  id: string;
  code: string;
  specialty: string;
  course: number;
  curatorTeacherId?: string;
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

export interface Course {
  id: string;
  name: string;
  code: string;
  departmentId: string;
  semester: number;
  credits: number;
}

export interface CourseAssignment {
  id: string;
  courseId: string;
  groupId: string;
  teacherId: string;
  academicYear: string;
  semester: number;
}

export interface Classroom {
  id: string;
  building: string;
  roomNumber: string;
  capacity: number;
  type: 'lecture' | 'lab' | 'seminar' | 'online';
}

export interface ScheduleEntry {
  id: string;
  courseAssignmentId: string;
  classroomId?: string;
  date: string;
  startTime: string;
  endTime: string;
  type: 'lecture' | 'seminar' | 'lab' | 'exam' | 'consultation';
  status: 'scheduled' | 'cancelled' | 'rescheduled';
}

export interface Material {
  id: string;
  courseAssignmentId: string;
  title: string;
  description?: string;
  fileLink?: string;
  publishDate: string;
}

export interface Assignment {
  id: string;
  courseAssignmentId: string;
  title: string;
  description: string;
  dueDate: string;
  maxScore: number;
}

export interface Submission {
  id: string;
  assignmentId: string;
  studentId: string;
  submittedAt: string;
  fileLink?: string;
  score?: number;
  comment?: string;
  status: 'submitted' | 'graded' | 'returned';
}

export interface Grade {
  id: string;
  studentId: string;
  courseAssignmentId: string;
  date: string;
  type: 'current' | 'module' | 'exam' | 'final';
  value: number;
  comment?: string;
}

export interface Notification {
  id: string;
  userId: string;
  type:
    | 'schedule_change'
    | 'new_assignment'
    | 'grade'
    | 'announcement'
    | 'system';
  title: string;
  message: string;
  createdAt: string;
  readFlag: boolean;
}
