import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../common/types/roles.enum';
import { RolesGuard } from './roles.guard';

function contextFor(role: Role): ExecutionContext {
  return {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({
      getRequest: () => ({
        user: { sub: 'user-id', login: `${role}-user`, role },
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  it.each(Object.values(Role))(
    'allows %s only when the role is explicitly declared',
    (role) => {
      const reflector = {
        getAllAndOverride: jest.fn().mockReturnValue([role]),
      } as unknown as Reflector;
      const guard = new RolesGuard(reflector);

      expect(guard.canActivate(contextFor(role))).toBe(true);
    },
  );

  it.each([
    Role.STUDENT,
    Role.TEACHER,
    Role.DEPARTMENT_HEAD,
    Role.DEAN,
    Role.RECTOR,
    Role.PRESIDENT,
  ])('does not inherit administrator permissions for %s', (role) => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([Role.ADMIN]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(contextFor(role))).toBe(false);
  });

  it('does not let rector inherit teacher permissions', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([Role.TEACHER]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(contextFor(Role.RECTOR))).toBe(false);
  });
});
