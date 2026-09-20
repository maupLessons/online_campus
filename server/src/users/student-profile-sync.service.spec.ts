import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { StudentProfileSyncService } from './student-profile-sync.service';
import { User } from './schemas';
import { Group } from '../references/schemas';
import { MaupStudentApiClient } from '../integrations/maup-student-api/maup-student-api.client';
import { MaupStudentApiError } from '../integrations/maup-student-api/maup-student-api.error';
import { AuditLogService } from '../audit-log/audit-log.service';

const q = <T>(v: T) => ({ exec: () => Promise.resolve(v) });

interface MockStudentProfile {
  _id: Types.ObjectId;
  externalStudentId: string;
  group: Types.ObjectId;
  recordBookNumber: string;
  year: number;
  status: string;
  syncedAt: Date;
  studyForm?: string;
  institute?: string;
  specialty?: string;
}

interface MockUserDoc {
  _id: Types.ObjectId;
  role: string;
  firstName: string;
  lastName: string;
  activeStudentProfileId: Types.ObjectId;
  studentProfiles: MockStudentProfile[];
  save: jest.Mock;
}

describe('StudentProfileSyncService', () => {
  const userId = new Types.ObjectId();
  const p1 = new Types.ObjectId();
  const p2 = new Types.ObjectId();
  const groupA = new Types.ObjectId();
  const groupB = new Types.ObjectId();
  let userDoc: MockUserDoc;
  const userModel = {
    findById: jest.fn(),
    updateOne: jest.fn(() => q({ modifiedCount: 1 })),
  };
  const groupModel = {
    findOne: jest.fn((query: { code: string }) =>
      q<{ _id: Types.ObjectId; code: string } | null>(
        query.code === 'КН-11' ? { _id: groupA, code: query.code } : null,
      ),
    ),
    create: jest.fn(),
  };
  const client = {
    getDiagnostics: jest.fn(() => ({ enabled: true })),
    getStudentInfo: jest.fn(),
  };
  const audit = { logAction: jest.fn() };
  const config = { get: jest.fn(() => undefined) };
  let service: StudentProfileSyncService;

  beforeEach(async () => {
    jest.clearAllMocks();
    userDoc = {
      _id: userId,
      role: 'student',
      firstName: 'Іван',
      lastName: 'Петренко',
      activeStudentProfileId: p1,
      studentProfiles: [
        {
          _id: p1,
          externalStudentId: '1001',
          group: groupA,
          recordBookNumber: 'A-1',
          year: 1,
          status: 'active',
          syncedAt: new Date(0),
        },
        {
          _id: p2,
          externalStudentId: '1002',
          group: groupB,
          recordBookNumber: 'B-1',
          year: 2,
          status: 'active',
          syncedAt: new Date(0),
        },
      ],
      save: jest.fn().mockResolvedValue(undefined),
    };
    userModel.findById.mockReturnValue(q(userDoc));
    groupModel.findOne.mockImplementation(({ code }) =>
      q(code === 'КН-11' ? { _id: groupA, code } : null),
    );
    groupModel.create.mockResolvedValue({
      _id: new Types.ObjectId(),
      code: 'НОВА-1',
    });
    const moduleRef = await Test.createTestingModule({
      providers: [
        StudentProfileSyncService,
        { provide: getModelToken(User.name), useValue: userModel },
        { provide: getModelToken(Group.name), useValue: groupModel },
        { provide: MaupStudentApiClient, useValue: client },
        { provide: AuditLogService, useValue: audit },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    service = moduleRef.get(StudentProfileSyncService);
  });

  it('upserts returned profiles, marks missing ones inactive, keeps local names', async () => {
    client.getStudentInfo.mockImplementation((id: string) =>
      Promise.resolve(
        id === '1001'
          ? [
              {
                student_id: 1001,
                first_name: 'ІНШЕ',
                last_name: 'ІМʼЯ',
                nsb: 'A-1',
                group: 'КН-11',
                course: 2,
                form_learn: 'денна',
                institute: 'ІКІТ',
                speciality: 'КН',
              },
            ]
          : [],
      ),
    );
    const result = await service.syncUser(userId.toHexString(), 'manual');
    expect(result).toEqual({ active: 1, inactive: 1 });
    expect(userDoc.studentProfiles[0]).toMatchObject({
      year: 2,
      studyForm: 'денна',
      institute: 'ІКІТ',
      specialty: 'КН',
      status: 'active',
    });
    expect(userDoc.studentProfiles[1].status).toBe('inactive');
    expect(userDoc.firstName).toBe('Іван');
    expect(userDoc.save).toHaveBeenCalled();
    expect(audit.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'student_profile.sync',
        details: { trigger: 'manual', active: 1, inactive: 1 },
      }),
    );
  });

  it('moves activeStudentProfileId when the active profile became inactive', async () => {
    userDoc.activeStudentProfileId = p2;
    client.getStudentInfo.mockImplementation((id: string) =>
      Promise.resolve(
        id === '1001'
          ? [{ student_id: 1001, nsb: 'A-1', group: 'КН-11', course: 1 }]
          : [],
      ),
    );
    await service.syncUser(userId.toHexString(), 'manual');
    expect(userDoc.activeStudentProfileId.toString()).toBe(p1.toString());
  });

  it('logs a warning and keeps the previous group when the code is unknown', async () => {
    client.getStudentInfo.mockImplementation((id: string) =>
      Promise.resolve(
        id === '1001'
          ? [{ student_id: 1001, nsb: 'A-1', group: 'НОВА-1', course: 1 }]
          : [],
      ),
    );
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    await service.syncUser(userId.toHexString(), 'manual');
    expect(groupModel.create).not.toHaveBeenCalled();
    expect(userDoc.studentProfiles[0].group).toBe(groupA); // previous group is preserved
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('НОВА-1'));
  });

  it('does not deactivate anything when the API returns no records at all', async () => {
    client.getStudentInfo.mockResolvedValue([]);
    await expect(
      service.syncUser(userId.toHexString(), 'manual'),
    ).resolves.toEqual({
      active: 2,
      inactive: 0,
      meta: { reason: 'empty_source' },
    });
    expect(
      userDoc.studentProfiles.every(
        (p: { status: string }) => p.status === 'active',
      ),
    ).toBe(true);
    expect(userDoc.save).not.toHaveBeenCalled();
    expect(audit.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({
          reason: 'empty_source',
        }) as unknown,
      }),
    );
  });

  it('skips silently when API is disabled or fails', async () => {
    client.getDiagnostics.mockReturnValue({ enabled: false });
    await expect(
      service.syncUser(userId.toHexString(), 'login'),
    ).resolves.toEqual({
      active: 2,
      inactive: 0,
      meta: { reason: 'api_disabled' },
    });
    expect(userDoc.save).not.toHaveBeenCalled();

    client.getDiagnostics.mockReturnValue({ enabled: true });
    client.getStudentInfo.mockRejectedValue(
      new MaupStudentApiError({ kind: 'timeout', endpoint: 'studentinfo' }),
    );
    await expect(
      service.syncUser(userId.toHexString(), 'login'),
    ).resolves.toEqual({
      active: 2,
      inactive: 0,
      meta: { reason: 'api_error' },
    });
  });

  it('shouldSyncOnLogin respects TTL', () => {
    expect(
      service.shouldSyncOnLogin({
        studentProfiles: [{ syncedAt: new Date(Date.now() - 25 * 3600_000) }],
      } as Pick<User, 'studentProfiles'>),
    ).toBe(true);
    expect(
      service.shouldSyncOnLogin({
        studentProfiles: [{ syncedAt: new Date() }],
      } as Pick<User, 'studentProfiles'>),
    ).toBe(false);
  });
});
