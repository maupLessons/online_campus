import { BadRequestException } from '@nestjs/common';
import { Role } from '../common/types/roles.enum';
import { ReferenceRelationsService } from './reference-relations.service';

function userQuery(result: unknown) {
  return {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(result),
  };
}

describe('ReferenceRelationsService', () => {
  const findById = jest.fn();
  const service = new ReferenceRelationsService({ findById } as never);

  beforeEach(() => {
    findById.mockReset();
  });

  it('accepts an active user with an allowed relation role', async () => {
    findById.mockReturnValue(
      userQuery({ role: Role.DEPARTMENT_HEAD, status: 'active' }),
    );

    await expect(
      service.assertDepartmentHead('6622b2a00f3a22d5b625d177'),
    ).resolves.toBeUndefined();
  });

  it('rejects a missing related user', async () => {
    findById.mockReturnValue(userQuery(null));

    await expect(
      service.assertFacultyDean('6622b2a00f3a22d5b625d177'),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects blocked users and invalid relation roles', async () => {
    findById
      .mockReturnValueOnce(userQuery({ role: Role.DEAN, status: 'blocked' }))
      .mockReturnValueOnce(userQuery({ role: Role.STUDENT, status: 'active' }));

    await expect(
      service.assertFacultyDean('6622b2a00f3a22d5b625d177'),
    ).rejects.toThrow('user is not active');
    await expect(
      service.assertGroupCurator('6622b2a00f3a22d5b625d178'),
    ).rejects.toThrow('user role must be');
  });
});
