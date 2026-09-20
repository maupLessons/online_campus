import { Role } from '../types/roles.enum';
import * as bcrypt from 'bcryptjs';
import {
  User,
  StudentProfile,
  TeacherProfile,
  Group,
  Department,
  Faculty,
  Course,
  CourseAssignment,
  Classroom,
  Notification,
  Specialty, // Add Specialty here
  AcademicTermSeed,
} from '../types/entities';

const hash = bcrypt.hashSync('password123', 10);

const ids = {
  'fac-1': '6622b2a00f3a22d5b625d001',
  'fac-2': '6622b2a00f3a22d5b625d002',
  'dep-1': '6622b2a00f3a22d5b625d011',
  'dep-2': '6622b2a00f3a22d5b625d012',
  'dep-3': '6622b2a00f3a22d5b625d013',
  'user-s1': '6622b2a00f3a22d5b625d101',
  'user-s2': '6622b2a00f3a22d5b625d102',
  'user-s3': '6622b2a00f3a22d5b625d103',
  'user-s4': '6622b2a00f3a22d5b625d104',
  'user-t1': '6622b2a00f3a22d5b625d111',
  'user-t2': '6622b2a00f3a22d5b625d112',
  'user-t3': '6622b2a00f3a22d5b625d113',
  'user-head-1': '6622b2a00f3a22d5b625d131',
  'user-head-2': '6622b2a00f3a22d5b625d132',
  'user-dean-1': '6622b2a00f3a22d5b625d141',
  'user-dean-2': '6622b2a00f3a22d5b625d142',
  'user-rector': '6622b2a00f3a22d5b625d151',
  'user-president': '6622b2a00f3a22d5b625d161',
  'user-admin': '6622b2a00f3a22d5b625d171',
  'grp-1': '6622b2a00f3a22d5b625d201',
  'grp-2': '6622b2a00f3a22d5b625d202',
  'grp-3': '6622b2a00f3a22d5b625d203',
  'crs-1': '6622b2a00f3a22d5b625d301',
  'crs-2': '6622b2a00f3a22d5b625d302',
  'crs-3': '6622b2a00f3a22d5b625d303',
  'crs-4': '6622b2a00f3a22d5b625d304',
  'crs-5': '6622b2a00f3a22d5b625d305',
  'ca-1': '6622b2a00f3a22d5b625d401',
  'ca-2': '6622b2a00f3a22d5b625d402',
  'ca-3': '6622b2a00f3a22d5b625d403',
  'ca-4': '6622b2a00f3a22d5b625d404',
  'ca-5': '6622b2a00f3a22d5b625d405',
  'room-1': '6622b2a00f3a22d5b625d501',
  'room-2': '6622b2a00f3a22d5b625d502',
  'room-3': '6622b2a00f3a22d5b625d503',
  'room-4': '6622b2a00f3a22d5b625d504',
  'room-5': '6622b2a00f3a22d5b625d505',
  'sch-1': '6622b2a00f3a22d5b625d601',
  'sch-2': '6622b2a00f3a22d5b625d602',
  'sch-3': '6622b2a00f3a22d5b625d603',
  'sch-4': '6622b2a00f3a22d5b625d604',
  'sch-5': '6622b2a00f3a22d5b625d605',
  'sch-6': '6622b2a00f3a22d5b625d606',
  'sch-7': '6622b2a00f3a22d5b625d607',
  'mat-1': '6622b2a00f3a22d5b625d701',
  'mat-2': '6622b2a00f3a22d5b625d702',
  'mat-3': '6622b2a00f3a22d5b625d703',
  'asgn-1': '6622b2a00f3a22d5b625d801',
  'asgn-2': '6622b2a00f3a22d5b625d802',
  'asgn-3': '6622b2a00f3a22d5b625d803',
  'sub-1': '6622b2a00f3a22d5b625d901',
  'sub-2': '6622b2a00f3a22d5b625d902',
  'sub-3': '6622b2a00f3a22d5b625d903',
  'grd-1': '6622b2a00f3a22d5b625da01',
  'grd-2': '6622b2a00f3a22d5b625da02',
  'grd-3': '6622b2a00f3a22d5b625da03',
  'grd-4': '6622b2a00f3a22d5b625da04',
  'grd-5': '6622b2a00f3a22d5b625da05',
  'ntf-1': '6622b2a00f3a22d5b625db01',
  'ntf-2': '6622b2a00f3a22d5b625db02',
  'ntf-3': '6622b2a00f3a22d5b625db03',
  'ntf-4': '6622b2a00f3a22d5b625db04',
  'ntf-5': '6622b2a00f3a22d5b625db05',
  'spec-1': '6622b2a00f3a22d5b625dc01', // New Specialty ID
  'spec-2': '6622b2a00f3a22d5b625dc02', // New Specialty ID
  'term-1': '6622b2a00f3a22d5b625dd01',
};

// ============ FACULTIES & DEPARTMENTS ============

export const faculties: Faculty[] = [
  {
    id: ids['fac-1'],
    name: "Факультет комп'ютерних та інформаційних технологій",
    deanUserId: ids['user-dean-1'],
  },
  {
    id: ids['fac-2'],
    name: 'Факультет права та міжнародних відносин',
    deanUserId: ids['user-dean-2'],
  },
];

export const departments: Department[] = [
  {
    id: ids['dep-1'],
    name: 'Кафедра інформаційних технологій',
    facultyId: ids['fac-1'],
    headUserId: ids['user-head-1'],
  },
  {
    id: ids['dep-2'],
    name: 'Кафедра програмної інженерії',
    facultyId: ids['fac-1'],
    headUserId: ids['user-head-2'],
  },
  {
    id: ids['dep-3'],
    name: 'Кафедра міжнародного права',
    facultyId: ids['fac-2'],
  },
];

// ============ USERS ============

export const users: User[] = [
  {
    id: ids['user-s1'],
    login: 'student1',
    passwordHash: hash,
    role: Role.STUDENT,
    email: 'student1@maup.com.ua',
    phone: '+380991111111',
    firstName: 'Олександр',
    lastName: 'Петренко',
    middleName: 'Іванович',
    status: 'active',
    createdAt: '2024-09-01',
  },
  {
    id: ids['user-s2'],
    login: 'student2',
    passwordHash: hash,
    role: Role.STUDENT,
    email: 'student2@maup.com.ua',
    phone: '+380992222222',
    firstName: 'Марія',
    lastName: 'Коваленко',
    middleName: 'Сергіївна',
    status: 'active',
    createdAt: '2024-09-01',
  },
  {
    id: ids['user-s3'],
    login: 'student3',
    passwordHash: hash,
    role: Role.STUDENT,
    email: 'student3@maup.com.ua',
    firstName: 'Андрій',
    lastName: 'Шевченко',
    status: 'active',
    createdAt: '2024-09-01',
  },
  {
    id: ids['user-s4'],
    login: 'student4',
    passwordHash: hash,
    role: Role.STUDENT,
    email: 'student4@maup.com.ua',
    firstName: 'Ірина',
    lastName: 'Бондаренко',
    status: 'active',
    createdAt: '2024-09-01',
  },
  {
    id: ids['user-t1'],
    login: 'teacher1',
    passwordHash: hash,
    role: Role.TEACHER,
    email: 'teacher1@maup.com.ua',
    firstName: 'Віктор',
    lastName: 'Мельник',
    middleName: 'Олегович',
    status: 'active',
    createdAt: '2024-08-01',
  },
  {
    id: ids['user-t2'],
    login: 'teacher2',
    passwordHash: hash,
    role: Role.TEACHER,
    email: 'teacher2@maup.com.ua',
    firstName: 'Наталія',
    lastName: 'Кравченко',
    middleName: 'Петрівна',
    status: 'active',
    createdAt: '2024-08-01',
  },
  {
    id: ids['user-t3'],
    login: 'teacher3',
    passwordHash: hash,
    role: Role.TEACHER,
    email: 'teacher3@maup.com.ua',
    firstName: 'Сергій',
    lastName: 'Ткаченко',
    status: 'active',
    createdAt: '2024-08-01',
  },
  {
    id: ids['user-head-1'],
    login: 'head1',
    passwordHash: hash,
    role: Role.DEPARTMENT_HEAD,
    email: 'head1@maup.com.ua',
    firstName: 'Петро',
    lastName: 'Григоренко',
    middleName: 'Васильович',
    status: 'active',
    createdAt: '2024-01-01',
  },
  {
    id: ids['user-head-2'],
    login: 'head2',
    passwordHash: hash,
    role: Role.DEPARTMENT_HEAD,
    email: 'head2@maup.com.ua',
    firstName: 'Ганна',
    lastName: 'Литвиненко',
    status: 'active',
    createdAt: '2024-01-01',
  },
  {
    id: ids['user-dean-1'],
    login: 'dean1',
    passwordHash: hash,
    role: Role.DEAN,
    email: 'dean1@maup.com.ua',
    firstName: 'Михайло',
    lastName: 'Козлов',
    middleName: 'Андрійович',
    status: 'active',
    createdAt: '2024-01-01',
  },
  {
    id: ids['user-dean-2'],
    login: 'dean2',
    passwordHash: hash,
    role: Role.DEAN,
    email: 'dean2@maup.com.ua',
    firstName: 'Тетяна',
    lastName: 'Іванова',
    status: 'active',
    createdAt: '2024-01-01',
  },
  {
    id: ids['user-rector'],
    login: 'rector',
    passwordHash: hash,
    role: Role.RECTOR,
    email: 'rector@maup.com.ua',
    firstName: 'Володимир',
    lastName: 'Сидоренко',
    middleName: 'Миколайович',
    status: 'active',
    createdAt: '2023-01-01',
  },
  {
    id: ids['user-president'],
    login: 'president',
    passwordHash: hash,
    role: Role.PRESIDENT,
    email: 'president@maup.com.ua',
    firstName: 'Юрій',
    lastName: 'Головко',
    middleName: 'Борисович',
    status: 'active',
    createdAt: '2023-01-01',
  },
  {
    id: ids['user-admin'],
    login: 'admin',
    passwordHash: hash,
    role: Role.ADMIN,
    email: 'admin@maup.com.ua',
    firstName: 'Адмін',
    lastName: 'Системний',
    status: 'active',
    createdAt: '2023-01-01',
  },
];

// ============ PROFILES ============

export const studentProfiles: StudentProfile[] = [
  {
    userId: ids['user-s1'],
    externalStudentId: 'seed-1001',
    groupId: ids['grp-1'],
    recordBookNumber: 'КН-2024-001',
    year: 1,
    studyForm: 'денна',
    institute: 'Інститут комп’ютерно-інформаційних технологій',
    specialty: "Комп'ютерні науки",
  },
  {
    userId: ids['user-s2'],
    externalStudentId: 'seed-1002',
    groupId: ids['grp-1'],
    recordBookNumber: 'КН-2024-002',
    year: 1,
    studyForm: 'денна',
    institute: 'Інститут комп’ютерно-інформаційних технологій',
    specialty: "Комп'ютерні науки",
  },
  {
    userId: ids['user-s3'],
    externalStudentId: 'seed-1003',
    groupId: ids['grp-2'],
    recordBookNumber: 'ПІ-2024-001',
    year: 2,
    studyForm: 'денна',
    institute: 'Інститут комп’ютерно-інформаційних технологій',
    specialty: 'Інженерія програмного забезпечення',
  },
  {
    userId: ids['user-s4'],
    externalStudentId: 'seed-1004',
    groupId: ids['grp-2'],
    recordBookNumber: 'ПІ-2024-002',
    year: 2,
    studyForm: 'денна',
    institute: 'Інститут комп’ютерно-інформаційних технологій',
    specialty: 'Інженерія програмного забезпечення',
  },
];

export const teacherProfiles: TeacherProfile[] = [
  {
    userId: ids['user-t1'],
    departmentId: ids['dep-1'],
    position: 'Доцент',
    externalTeacherId: 'seed-t1',
  },
  {
    userId: ids['user-t2'],
    departmentId: ids['dep-1'],
    position: 'Старший викладач',
    externalTeacherId: 'seed-t2',
  },
  {
    userId: ids['user-t3'],
    departmentId: ids['dep-2'],
    position: 'Професор',
    externalTeacherId: 'seed-t3',
  },
  {
    userId: ids['user-head-1'],
    departmentId: ids['dep-1'],
    position: 'Завідувач кафедри',
    externalTeacherId: 'seed-t4',
  },
  {
    userId: ids['user-head-2'],
    departmentId: ids['dep-2'],
    position: 'Завідувач кафедри',
    externalTeacherId: 'seed-t5',
  },
];

// ============ SPECIALTIES ============

export const specialties: Specialty[] = [
  {
    id: ids['spec-1'],
    name: "Комп'ютерні науки",
    code: '121',
  },
  {
    id: ids['spec-2'],
    name: 'Програмна інженерія',
    code: '126',
  },
];

// ============ GROUPS ============

export const groups: Group[] = [
  {
    id: ids['grp-1'],
    code: 'КН-11',
    specialty: ids['spec-1'],
    course: 1,
    curator: ids['user-t1'],
  },
  {
    id: ids['grp-2'],
    code: 'ПІ-21',
    specialty: ids['spec-2'],
    course: 2,
    curator: ids['user-t3'],
  },
  {
    id: ids['grp-3'],
    code: 'КН-31',
    specialty: ids['spec-1'],
    course: 3,
  },
];

// ============ COURSES ============

export const courses: Course[] = [
  {
    id: ids['crs-1'],
    name: 'Основи програмування',
    code: 'CS101',
    departmentId: ids['dep-1'],
    credits: 5,
    description:
      'Вступ до програмування на Python: змінні, умови, цикли, функції.',
    externalSubjectId: '1001',
    moodleUrl: 'https://dist.maup.com.ua/course/view.php?id=101',
    status: 'active',
    createdBy: ids['user-admin'],
  },
  {
    id: ids['crs-2'],
    name: 'Бази даних',
    code: 'CS201',
    departmentId: ids['dep-1'],
    credits: 4,
    description: 'Реляційна модель, SQL, нормалізація, індекси.',
    externalSubjectId: '1002',
    status: 'active',
    createdBy: ids['user-admin'],
  },
  {
    id: ids['crs-3'],
    name: 'Веб-технології',
    code: 'SE301',
    departmentId: ids['dep-2'],
    credits: 4,
    externalSubjectId: '1003',
    status: 'active',
    createdBy: ids['user-admin'],
  },
  {
    id: ids['crs-4'],
    name: 'Алгоритми та структури даних',
    code: 'CS102',
    departmentId: ids['dep-1'],
    credits: 5,
    status: 'active',
    createdBy: ids['user-admin'],
  },
  {
    id: ids['crs-5'],
    name: 'Операційні системи',
    code: 'CS202',
    departmentId: ids['dep-2'],
    credits: 3,
    status: 'active',
    createdBy: ids['user-admin'],
  },
];

// ============ ACADEMIC TERMS ============

export const academicTerms: AcademicTermSeed[] = [
  {
    id: ids['term-1'],
    academicYear: '2026/2027',
    termNumber: 1,
    startsAt: '2026-09-01',
    endsAt: '2027-01-31',
    status: 'current',
    maupAcademicYear: 2026,
    maupSemester: 1,
  },
];

// ============ COURSE ASSIGNMENTS ============

export const courseAssignments: CourseAssignment[] = [
  {
    id: ids['ca-1'],
    courseId: ids['crs-1'],
    groupId: ids['grp-1'],
    teacherId: ids['user-t1'],
    termId: ids['term-1'],
  },
  {
    id: ids['ca-2'],
    courseId: ids['crs-4'],
    groupId: ids['grp-1'],
    teacherId: ids['user-t2'],
    termId: ids['term-1'],
  },
  {
    id: ids['ca-3'],
    courseId: ids['crs-2'],
    groupId: ids['grp-2'],
    teacherId: ids['user-t1'],
    termId: ids['term-1'],
  },
  {
    id: ids['ca-4'],
    courseId: ids['crs-3'],
    groupId: ids['grp-2'],
    teacherId: ids['user-t3'],
    termId: ids['term-1'],
  },
  {
    id: ids['ca-5'],
    courseId: ids['crs-5'],
    groupId: ids['grp-1'],
    teacherId: ids['user-t3'],
    termId: ids['term-1'],
  },
];

// ============ CLASSROOMS ============

export const classrooms: Classroom[] = [
  {
    id: ids['room-1'],
    building: 'Корпус 1',
    roomNumber: '101',
    capacity: 30,
    type: 'lecture',
  },
  {
    id: ids['room-2'],
    building: 'Корпус 1',
    roomNumber: '205',
    capacity: 20,
    type: 'lab',
  },
  {
    id: ids['room-3'],
    building: 'Корпус 2',
    roomNumber: '301',
    capacity: 50,
    type: 'lecture',
  },
  {
    id: ids['room-4'],
    building: 'Корпус 2',
    roomNumber: '102',
    capacity: 15,
    type: 'seminar',
  },
  {
    id: ids['room-5'],
    building: 'Онлайн',
    roomNumber: 'Zoom',
    capacity: 100,
    type: 'online',
  },
];

// ============ NOTIFICATIONS ============

export const notifications: Notification[] = [
  {
    id: ids['ntf-3'],
    userId: ids['user-s1'],
    type: 'schedule_change',
    title: 'Зміна розкладу',
    message: 'Заняття "Основи програмування" 20.02 скасовано',
    createdAt: '2025-02-19T09:00:00Z',
    readFlag: false,
  },
  {
    id: ids['ntf-4'],
    userId: ids['user-s2'],
    type: 'announcement',
    title: 'Оголошення',
    message: 'Збори групи КН-11 о 15:00 в ауд. 101',
    createdAt: '2025-02-16T10:00:00Z',
    readFlag: false,
  },
  {
    id: ids['ntf-5'],
    userId: ids['user-t1'],
    type: 'system',
    title: 'Система',
    message: 'Розклад на наступний тиждень затверджено',
    createdAt: '2025-02-14T16:00:00Z',
    readFlag: true,
  },
];
