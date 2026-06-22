import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { Role } from '../common/types/roles.enum';
import { ChangeUserRoleDto } from './dto/change-user-role.dto';
import { UsersService } from './users.service';

type ModelMock = {
  findById: jest.Mock;
  findByIdAndUpdate: jest.Mock;
  findOne: jest.Mock;
  countDocuments: jest.Mock;
  paginate: jest.Mock;
};

function objectId(): string {
  return new Types.ObjectId().toHexString();
}

function query<T>(value: T) {
  return {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(value),
  };
}

function userResponse(overrides: Record<string, unknown> = {}) {
  return {
    _id: objectId(),
    login: 'user1',
    email: 'user1@maup.com.ua',
    role: Role.TEACHER,
    firstName: 'Іван',
    lastName: 'Петренко',
    status: 'active',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    ...overrides,
  };
}

describe('UsersService', () => {
  let service: UsersService;
  let model: ModelMock;
  let academicAccessService: {
    buildVisibleUserFilter: jest.Mock;
    canAccessGroup: jest.Mock;
    canAccessDepartment: jest.Mock;
  };
  let removeAllRefreshTokenHashesSpy: jest.SpyInstance;

  beforeEach(() => {
    model = {
      findById: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      findOne: jest.fn(),
      countDocuments: jest.fn(),
      paginate: jest.fn(),
    };

    academicAccessService = {
      buildVisibleUserFilter: jest.fn().mockResolvedValue({}),
      canAccessGroup: jest.fn().mockResolvedValue(true),
      canAccessDepartment: jest.fn().mockResolvedValue(true),
    };

    service = new UsersService(model as never, academicAccessService as never);
    removeAllRefreshTokenHashesSpy = jest
      .spyOn(service, 'removeAllRefreshTokenHashes')
      .mockResolvedValue(undefined);
  });

  it('paginates a role-filtered multi-part name search', async () => {
    model.paginate.mockResolvedValue({
      docs: [userResponse({ role: Role.STUDENT })],
      totalDocs: 31,
      limit: 25,
      page: 2,
      totalPages: 2,
      hasNextPage: false,
      hasPrevPage: true,
      nextPage: null,
      prevPage: 1,
    });
    const requester = {
      sub: objectId(),
      login: 'rector',
      role: Role.RECTOR,
    };

    const result = await service.findAll(
      { page: 2, limit: 25 },
      Role.STUDENT,
      'Петренко Іван',
      requester,
    );

    const [filter, options] = model.paginate.mock.calls[0] as [
      { $and: Array<Record<string, unknown>> },
      Record<string, unknown>,
    ];
    expect(filter.$and[0]).toEqual({ role: Role.STUDENT });
    expect(filter.$and).toHaveLength(3);
    expect(filter.$and[1]).toHaveProperty('$or');
    expect(filter.$and[2]).toHaveProperty('$or');
    expect(options).toMatchObject({ page: 2, limit: 25, lean: true });
    expect(academicAccessService.buildVisibleUserFilter).toHaveBeenCalledWith(
      requester,
    );
    expect(result).toMatchObject({
      totalDocs: 31,
      page: 2,
      totalPages: 2,
      hasPrevPage: true,
    });
  });

  it('changes a student to teacher, clears the student profile and resets refresh sessions', async () => {
    const userId = objectId();
    const departmentId = objectId();
    const dto: ChangeUserRoleDto = {
      role: Role.TEACHER,
      departmentId,
      position: 'Професор',
    };

    model.findById.mockReturnValue(
      query({
        role: Role.STUDENT,
        status: 'active',
      }),
    );
    model.findByIdAndUpdate.mockReturnValue(
      query(
        userResponse({
          _id: userId,
          role: Role.TEACHER,
          teacherProfile: {
            department: departmentId,
            position: 'Професор',
          },
        }),
      ),
    );

    const result = await service.changeRole(userId, dto, objectId());

    expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
      userId,
      {
        $set: {
          role: Role.TEACHER,
          teacherProfile: {
            department: departmentId,
            position: 'Професор',
          },
        },
        $unset: {
          studentProfile: '',
        },
      },
      { returnDocument: 'after', runValidators: true },
    );
    expect(removeAllRefreshTokenHashesSpy).toHaveBeenCalledWith(userId);
    expect(result.role).toBe(Role.TEACHER);
  });

  it('rejects self role changes before loading the target user', async () => {
    const userId = objectId();

    await expect(
      service.changeRole(userId, { role: Role.DEAN }, userId),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(model.findById).not.toHaveBeenCalled();
    expect(model.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('also rejects self role changes through the general update endpoint', async () => {
    const userId = objectId();

    model.findById.mockReturnValue(
      query({
        role: Role.ADMIN,
        status: 'active',
      }),
    );

    await expect(
      service.update(userId, { role: Role.DEAN }, userId),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(model.findById).toHaveBeenCalledWith(userId);
    expect(model.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('allows a general self update when the submitted role is unchanged', async () => {
    const userId = objectId();

    model.findById.mockReturnValue(
      query({
        role: Role.ADMIN,
        status: 'active',
      }),
    );
    model.findByIdAndUpdate.mockReturnValue(
      query(
        userResponse({
          _id: userId,
          role: Role.ADMIN,
          firstName: 'Олег',
        }),
      ),
    );

    const result = await service.update(
      userId,
      { role: Role.ADMIN, firstName: 'Олег' },
      userId,
    );

    expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
      userId,
      {
        $set: {
          firstName: 'Олег',
          role: Role.ADMIN,
        },
      },
      { returnDocument: 'after', runValidators: true },
    );
    expect(removeAllRefreshTokenHashesSpy).not.toHaveBeenCalled();
    expect(result.firstName).toBe('Олег');
  });

  it('requires a complete student profile when changing to student role', async () => {
    const userId = objectId();

    model.findById.mockReturnValue(
      query({
        role: Role.TEACHER,
        status: 'active',
      }),
    );

    await expect(
      service.changeRole(
        userId,
        {
          role: Role.STUDENT,
          groupId: objectId(),
          year: 1,
        },
        objectId(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(model.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(removeAllRefreshTokenHashesSpy).not.toHaveBeenCalled();
  });

  it('rejects duplicate student record book numbers', async () => {
    const userId = objectId();

    model.findById.mockReturnValue(
      query({
        role: Role.TEACHER,
        status: 'active',
      }),
    );
    model.findOne.mockReturnValue(query({ _id: objectId() }));

    await expect(
      service.changeRole(
        userId,
        {
          role: Role.STUDENT,
          groupId: objectId(),
          recordBookNumber: 'КН-2026-001',
          year: 1,
        },
        objectId(),
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(model.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(removeAllRefreshTokenHashesSpy).not.toHaveBeenCalled();
  });

  it('protects the last active admin from demotion', async () => {
    const userId = objectId();

    model.findById.mockReturnValue(
      query({
        role: Role.ADMIN,
        status: 'active',
      }),
    );
    model.countDocuments.mockReturnValue(query(0));

    await expect(
      service.changeRole(userId, { role: Role.DEAN }, objectId()),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(model.countDocuments).toHaveBeenCalledWith({
      role: Role.ADMIN,
      status: 'active',
      _id: { $ne: userId },
    });
    expect(model.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(removeAllRefreshTokenHashesSpy).not.toHaveBeenCalled();
  });

  it('rejects self blocking before loading the target user', async () => {
    const userId = objectId();

    await expect(service.toggleBlock(userId, userId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(model.findById).not.toHaveBeenCalled();
    expect(model.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('protects the last active admin from blocking', async () => {
    const userId = objectId();

    model.findById.mockReturnValue(
      query({
        role: Role.ADMIN,
        status: 'active',
      }),
    );
    model.countDocuments.mockReturnValue(query(0));

    await expect(
      service.toggleBlock(userId, objectId()),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(model.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('revokes refresh sessions when the general update blocks a user', async () => {
    const userId = objectId();

    model.findById.mockReturnValue(
      query({
        login: 'teacher1',
        role: Role.TEACHER,
        status: 'active',
      }),
    );
    model.findByIdAndUpdate.mockReturnValue(
      query(
        userResponse({
          _id: userId,
          status: 'blocked',
        }),
      ),
    );

    await service.update(userId, { status: 'blocked' }, objectId());

    expect(removeAllRefreshTokenHashesSpy).toHaveBeenCalledWith(userId);
    expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
      userId,
      { $set: { status: 'blocked' } },
      { returnDocument: 'after', runValidators: true },
    );
  });
});
