import 'reflect-metadata';
import { Role } from '../common/types/roles.enum';
import { ScheduleController } from '../schedule/schedule.controller';
import { UsersController } from '../users/users.controller';
import { ROLES_KEY } from './roles.guard';

const NON_ADMIN_ROLES = Object.values(Role).filter(
  (role) => role !== Role.ADMIN,
);

function rolesFor(method: (...args: never[]) => unknown): Role[] {
  return (Reflect.getMetadata(ROLES_KEY, method) as Role[] | undefined) ?? [];
}

function controllerMethod(
  prototype: object,
  methodName: string,
): (...args: never[]) => unknown {
  const method = Object.getOwnPropertyDescriptor(prototype, methodName)
    ?.value as ((...args: never[]) => unknown) | undefined;
  if (!method) {
    throw new Error(`Controller method ${methodName} is missing`);
  }
  return method;
}

describe('critical RBAC regression policy', () => {
  it('keeps the active role model limited to approved roles', () => {
    expect(Object.values(Role)).toEqual([
      Role.STUDENT,
      Role.TEACHER,
      Role.DEPARTMENT_HEAD,
      Role.DEAN,
      Role.RECTOR,
      Role.PRESIDENT,
      Role.ADMIN,
    ]);
  });

  const userMutations = ['create', 'update', 'changeRole', 'toggleBlock'].map(
    (methodName) => controllerMethod(UsersController.prototype, methodName),
  );

  it.each(userMutations)(
    'keeps every user mutation restricted to administrators',
    (mutation) => {
      expect(rolesFor(mutation)).toEqual([Role.ADMIN]);
      expect(NON_ADMIN_ROLES).not.toContain(Role.ADMIN);
    },
  );

  const scheduleMutations = [
    'createTemplate',
    'updateTemplate',
    'deleteTemplate',
    'applyTemplate',
    'bulkCreate',
    'bulkCancel',
    'create',
    'update',
    'cancel',
    'reschedule',
    'substitute',
    'delete',
  ].map((methodName) =>
    controllerMethod(ScheduleController.prototype, methodName),
  );

  it.each(scheduleMutations)(
    'keeps every schedule mutation restricted to administrators',
    (mutation) => {
      expect(rolesFor(mutation)).toEqual([Role.ADMIN]);
    },
  );

  it('keeps rector and president outside administrator-only policies', () => {
    for (const mutation of [...userMutations, ...scheduleMutations]) {
      expect(rolesFor(mutation)).not.toContain(Role.RECTOR);
      expect(rolesFor(mutation)).not.toContain(Role.PRESIDENT);
    }
  });

  it.each(Object.values(Role))(
    'applies the endpoint mutation matrix explicitly for %s',
    (role) => {
      for (const mutation of [...userMutations, ...scheduleMutations]) {
        expect(rolesFor(mutation).includes(role)).toBe(role === Role.ADMIN);
      }
    },
  );

  it('grants rector and president user-directory reads without mutations', () => {
    const directoryRoles = rolesFor(
      controllerMethod(UsersController.prototype, 'findAll'),
    );
    const detailRoles = rolesFor(
      controllerMethod(UsersController.prototype, 'findOne'),
    );

    expect(directoryRoles).toEqual([Role.ADMIN, Role.RECTOR, Role.PRESIDENT]);
    expect(detailRoles).toEqual([
      Role.ADMIN,
      Role.RECTOR,
      Role.PRESIDENT,
      Role.DEAN,
    ]);
  });
});
