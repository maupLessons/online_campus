import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { Role } from '../common/types/roles.enum';
import { ChangeUserRoleDto } from './dto/change-user-role.dto';
import { UsersService } from './users.service';

type ModelMock = jest.Mock & {
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
    populate: jest.fn().mockReturnThis(),
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
    studentProfiles: [],
    activeStudentProfileId: null,
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
    model = jest.fn() as unknown as ModelMock;
    model.mockImplementation((doc: Record<string, unknown>) => ({
      ...doc,
      save: jest.fn().mockResolvedValue({
        toObject: () => ({
          ...doc,
          _id: new Types.ObjectId(),
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
      }),
    }));
    model.findById = jest.fn();
    model.findByIdAndUpdate = jest.fn();
    model.findOne = jest.fn();
    model.countDocuments = jest.fn();
    model.paginate = jest.fn();

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
      {
        role: Role.STUDENT,
        status: 'active',
        search: 'Петренко Іван',
      },
      requester,
    );

    const [filter, options] = model.paginate.mock.calls[0] as [
      { $and: Array<Record<string, unknown>> },
      Record<string, unknown>,
    ];
    expect(filter.$and[0]).toEqual({ role: Role.STUDENT });
    expect(filter.$and[1]).toEqual({ status: 'active' });
    expect(filter.$and).toHaveLength(4);
    expect(filter.$and[2]).toHaveProperty('$or');
    expect(filter.$and[3]).toHaveProperty('$or');
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

  it('create(student) stores studentProfiles and sets the first one active', async () => {
    model.findOne.mockReturnValue(query(null));

    const dto = {
      login: 's',
      email: 's@e.t',
      password: 'Password1',
      role: Role.STUDENT,
      firstName: 'A',
      lastName: 'B',
      studentProfiles: [
        {
          externalStudentId: '1001',
          groupId: objectId(),
          recordBookNumber: 'КН-1',
          year: 1,
        },
      ],
    };

    const created = await service.create(dto);

    expect(created.studentProfiles).toHaveLength(1);
    expect(created.activeStudentProfileId).toBe(created.studentProfiles[0].id);
  });

  it('create(student) without profiles throws BadRequest', async () => {
    model.findOne.mockReturnValue(query(null));

    await expect(
      service.create({
        login: 's',
        email: 's@e.t',
        password: 'Password1',
        role: Role.STUDENT,
        firstName: 'A',
        lastName: 'B',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('create(student) rejects two profiles with the same record book number', async () => {
    model.findOne.mockReturnValue(query(null));
    const groupId = objectId();
    const profile = {
      externalStudentId: '1',
      groupId,
      recordBookNumber: 'КН-1',
      year: 1,
    };

    await expect(
      service.create({
        login: 's',
        email: 's@e.t',
        password: 'Password1',
        role: Role.STUDENT,
        firstName: 'A',
        lastName: 'B',
        studentProfiles: [profile, { ...profile, externalStudentId: '2' }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('getActiveStudentProfile returns populated active profile', async () => {
    const userId = objectId();
    const pid = objectId();
    const groupId = objectId();

    model.findById.mockReturnValue(
      query({
        role: Role.STUDENT,
        status: 'active',
        activeStudentProfileId: pid,
        studentProfiles: [
          {
            _id: pid,
            status: 'active',
            group: { _id: groupId, code: 'КН-11' },
            recordBookNumber: 'x',
            year: 1,
          },
        ],
      }),
    );

    const profile = await service.getActiveStudentProfile(userId);
    expect(profile?.group.code).toBe('КН-11');
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
          studentProfiles: [],
          activeStudentProfileId: null,
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

  it('update(student) upserts studentProfiles by externalStudentId: preserves _id, deactivates missing entries instead of deleting them, and keeps the active pointer', async () => {
    const userId = objectId();
    const profileAId = new Types.ObjectId();
    const profileBId = new Types.ObjectId();
    const oldGroupId = objectId();
    const newGroupId = objectId();
    const syncedAtA = new Date('2026-01-01T00:00:00.000Z');
    const syncedAtB = new Date('2026-01-02T00:00:00.000Z');

    const existingStudentProfiles = [
      {
        _id: profileAId,
        externalStudentId: 'EXT-1',
        group: oldGroupId,
        recordBookNumber: 'RB-1',
        year: 1,
        studyForm: 'Денна',
        status: 'active',
        syncedAt: syncedAtA,
      },
      {
        _id: profileBId,
        externalStudentId: 'EXT-2',
        group: oldGroupId,
        recordBookNumber: 'RB-2',
        year: 2,
        status: 'active',
        syncedAt: syncedAtB,
      },
    ];

    const existingUserDoc = {
      role: Role.STUDENT,
      status: 'active',
      studentProfiles: existingStudentProfiles,
      activeStudentProfileId: profileAId,
      toObject: () => ({ studentProfiles: existingStudentProfiles }),
    };

    model.findById.mockReturnValue(query(existingUserDoc));
    model.findOne.mockReturnValue(query(null));
    model.findByIdAndUpdate.mockReturnValue(
      query(userResponse({ _id: userId, role: Role.STUDENT })),
    );

    await service.update(userId, {
      studentProfiles: [
        {
          externalStudentId: 'EXT-1',
          groupId: newGroupId,
          recordBookNumber: 'RB-1-updated',
          year: 2,
          studyForm: 'Заочна',
        },
      ],
    });

    const [, updateOperation] = model.findByIdAndUpdate.mock.calls[0] as [
      string,
      {
        $set: {
          studentProfiles: Array<Record<string, unknown>>;
          activeStudentProfileId: Types.ObjectId;
        };
      },
    ];
    const merged = updateOperation.$set.studentProfiles;

    expect(merged).toHaveLength(2);

    const updated = merged.find((p) => p.externalStudentId === 'EXT-1')!;
    expect(updated._id).toBe(profileAId);
    expect((updated.group as Types.ObjectId).toString()).toBe(newGroupId);
    expect(updated.recordBookNumber).toBe('RB-1-updated');
    expect(updated.status).toBe('active');
    expect(updated.syncedAt).toBe(syncedAtA);

    const deactivated = merged.find((p) => p.externalStudentId === 'EXT-2')!;
    expect(deactivated._id).toBe(profileBId);
    expect(deactivated.status).toBe('inactive');
    expect(deactivated.recordBookNumber).toBe('RB-2');

    expect(updateOperation.$set.activeStudentProfileId).toBe(profileAId);
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
          studentProfiles: [],
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
          studentProfiles: [
            {
              externalStudentId: '1',
              groupId: objectId(),
              recordBookNumber: 'КН-2026-001',
              year: 1,
            },
          ],
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

  it('exposes externalStudentId only when the requester is admin', async () => {
    const profileId = new Types.ObjectId();
    const doc = userResponse({
      role: Role.STUDENT,
      studentProfiles: [
        {
          _id: profileId,
          externalStudentId: 'EXT-1',
          group: new Types.ObjectId(),
          recordBookNumber: 'REC-1',
          year: 1,
          status: 'active',
          syncedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ],
      activeStudentProfileId: profileId,
    });

    model.findOne.mockReturnValue(query(doc));
    const asAdmin = await service.findOne(String(doc._id), {
      sub: objectId(),
      login: 'admin',
      role: Role.ADMIN,
    });
    expect(asAdmin.studentProfiles[0]).toHaveProperty(
      'externalStudentId',
      'EXT-1',
    );

    model.findOne.mockReturnValue(query(doc));
    const asStudent = await service.findOne(String(doc._id), {
      sub: objectId(),
      login: 'student1',
      role: Role.STUDENT,
    });
    expect(asStudent.studentProfiles[0].externalStudentId).toBeUndefined();

    model.paginate.mockResolvedValue({
      docs: [doc],
      totalDocs: 1,
      limit: 25,
      page: 1,
      totalPages: 1,
      hasNextPage: false,
      hasPrevPage: false,
      nextPage: null,
      prevPage: null,
    });
    const listAsAdmin = await service.findAll(
      { page: 1, limit: 25 },
      {},
      { sub: objectId(), login: 'admin', role: Role.ADMIN },
    );
    expect(listAsAdmin.docs[0].studentProfiles[0]).toHaveProperty(
      'externalStudentId',
      'EXT-1',
    );

    model.paginate.mockResolvedValue({
      docs: [doc],
      totalDocs: 1,
      limit: 25,
      page: 1,
      totalPages: 1,
      hasNextPage: false,
      hasPrevPage: false,
      nextPage: null,
      prevPage: null,
    });
    const listAsStudent = await service.findAll(
      { page: 1, limit: 25 },
      {},
      { sub: objectId(), login: 'student1', role: Role.STUDENT },
    );
    expect(
      listAsStudent.docs[0].studentProfiles[0].externalStudentId,
    ).toBeUndefined();
  });
});
