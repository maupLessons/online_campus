export enum Role {
  STUDENT = 'student',
  TEACHER = 'teacher',
  DISPATCHER = 'dispatcher',
  DEPARTMENT_HEAD = 'department_head',
  DEAN = 'dean',
  RECTOR = 'rector',
  PRESIDENT = 'president',
  ADMIN = 'admin',
}

export const ROLE_HIERARCHY: Record<Role, Role[]> = {
  [Role.STUDENT]: [],
  [Role.TEACHER]: [],
  [Role.DISPATCHER]: [],
  [Role.DEPARTMENT_HEAD]: [Role.TEACHER],
  [Role.DEAN]: [Role.DEPARTMENT_HEAD, Role.TEACHER],
  [Role.RECTOR]: [Role.DEAN, Role.DEPARTMENT_HEAD, Role.TEACHER],
  [Role.PRESIDENT]: [
    Role.RECTOR,
    Role.DEAN,
    Role.DEPARTMENT_HEAD,
    Role.TEACHER,
    Role.STUDENT,
  ],
  [Role.ADMIN]: [],
};
