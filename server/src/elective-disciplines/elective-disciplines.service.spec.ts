import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { Role } from '../common/types/roles.enum';
import { AcademicTermsService } from '../academic-terms/academic-terms.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/dto/create-notification.dto';
import { UsersService } from '../users/users.service';
import { ElectiveDisciplinesService } from './elective-disciplines.service';
import {
  ElectiveDisciplineStatus,
  ElectiveSelectionPeriodStatus,
  ElectiveSelectionStatus,
} from './schemas';
import { DomainAuditEvent } from '../audit-log/audit-context';
import { AUDIT_ACTIONS } from '../audit-log/audit-actions';

type QueryChain<T> = {
  populate: jest.Mock<QueryChain<T>, [unknown?]>;
  sort: jest.Mock<QueryChain<T>, [unknown?]>;
  select: jest.Mock<QueryChain<T>, [unknown?]>;
  lean: jest.Mock<QueryChain<T>, []>;
  exec: jest.Mock<Promise<T>, []>;
};

function queryChain<T>(value: T): QueryChain<T> {
  const chain: QueryChain<T> = {
    populate: jest.fn<QueryChain<T>, [unknown?]>(),
    sort: jest.fn<QueryChain<T>, [unknown?]>(),
    select: jest.fn<QueryChain<T>, [unknown?]>(),
    lean: jest.fn<QueryChain<T>, []>(),
    exec: jest.fn<Promise<T>, []>().mockResolvedValue(value),
  };

  chain.populate.mockReturnValue(chain);
  chain.sort.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);
  chain.lean.mockReturnValue(chain);

  return chain;
}

const fixtureTermId = new Types.ObjectId('6622b2a00f3a22d5b625d1a0');

function createDiscipline(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId('6622b2a00f3a22d5b625d180'),
    code: 'EL-CYB-01',
    title: 'Основи кібербезпеки',
    description: 'Практичний курс',
    department: {
      _id: new Types.ObjectId('6622b2a00f3a22d5b625d181'),
      name: 'Кафедра ІТ',
    },
    teacher: null,
    term: {
      _id: fixtureTermId,
      academicYear: '2026/2027',
      termNumber: 1,
    },
    credits: 4,
    capacity: 2,
    enrolledCount: 0,
    status: ElectiveDisciplineStatus.ACTIVE,
    createdBy: new Types.ObjectId('6622b2a00f3a22d5b625d182'),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    save: jest.fn(),
    ...overrides,
  };
}

function createPeriod(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId('6622b2a00f3a22d5b625d183'),
    title: 'Вибір на осінній семестр',
    term: {
      _id: fixtureTermId,
      academicYear: '2026/2027',
      termNumber: 1,
    },
    startsAt: new Date('2026-01-01T00:00:00.000Z'),
    endsAt: new Date('2099-01-01T00:00:00.000Z'),
    status: ElectiveSelectionPeriodStatus.ACTIVE,
    targetGroups: [
      {
        _id: new Types.ObjectId('6622b2a00f3a22d5b625d184'),
        code: 'КН-31',
      },
    ],
    requiredChoices: 1,
    createdBy: new Types.ObjectId('6622b2a00f3a22d5b625d182'),
    publishedAt: new Date('2026-01-01T00:00:00.000Z'),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    save: jest.fn(),
    ...overrides,
  };
}

describe('ElectiveDisciplinesService', () => {
  let service: ElectiveDisciplinesService;
  let disciplineModel: {
    find: jest.Mock;
    findById: jest.Mock;
    findOneAndUpdate: jest.Mock;
    updateOne: jest.Mock;
  };
  let periodModel: {
    find: jest.Mock;
    findById: jest.Mock;
    findOneAndUpdate: jest.Mock;
    create: jest.Mock;
    updateMany: jest.Mock;
    updateOne: jest.Mock;
    exists: jest.Mock;
  };
  let groupModel: {
    countDocuments: jest.Mock;
  };
  let departmentModel: {
    findById: jest.Mock;
    find: jest.Mock;
  };
  let academicTerms: {
    getCurrent: jest.Mock;
    requireCurrent: jest.Mock;
    findById: jest.Mock;
  };
  let selectionModel: {
    find: jest.Mock;
    findOne: jest.Mock;
    findOneAndDelete: jest.Mock;
    findOneAndUpdate: jest.Mock;
    findById: jest.Mock;
    countDocuments: jest.Mock;
    distinct: jest.Mock;
    create: jest.Mock;
    updateMany: jest.Mock;
  };
  let courseModel: {
    findOneAndUpdate: jest.Mock;
  };
  let courseAssignmentModel: {
    find: jest.Mock;
    findOne: jest.Mock;
    findOneAndUpdate: jest.Mock;
  };
  let userModel: {
    find: jest.Mock;
    countDocuments: jest.Mock;
  };
  let usersService: jest.Mocked<
    Pick<UsersService, 'findOne' | 'getActiveStudentProfile'>
  >;
  let notificationsService: { createMany: jest.Mock };

  const studentId = new Types.ObjectId('6622b2a00f3a22d5b625d185');
  const groupId = '6622b2a00f3a22d5b625d184';
  const period = createPeriod();
  const discipline = createDiscipline();
  const admin = {
    sub: '6622b2a00f3a22d5b625d1a3',
    login: 'admin1',
    role: Role.ADMIN,
  };
  const student = {
    sub: studentId.toHexString(),
    login: 'student1',
    role: Role.STUDENT,
  };

  beforeEach(() => {
    disciplineModel = {
      find: jest.fn().mockReturnValue(queryChain([discipline])),
      findById: jest.fn().mockReturnValue(queryChain(discipline)),
      findOneAndUpdate: jest.fn().mockReturnValue(queryChain(discipline)),
      updateOne: jest.fn().mockReturnValue(queryChain({ modifiedCount: 1 })),
    };
    periodModel = {
      find: jest.fn().mockReturnValue(queryChain([period])),
      findById: jest.fn().mockReturnValue(queryChain(period)),
      // Default: no period matches a lazy transition's conditional filter
      // (findActiveForStudent/listPeriods now also call remindDuePeriods,
      // which loops on findOneAndUpdate until it returns null). Tests that
      // exercise finalizePeriod's own two-step lock/finalize sequence queue
      // their own mockReturnValueOnce values, taking precedence over this.
      findOneAndUpdate: jest.fn().mockReturnValue(queryChain(null)),
      create: jest.fn().mockResolvedValue(period),
      updateMany: jest.fn().mockReturnValue(queryChain({ modifiedCount: 0 })),
      updateOne: jest.fn().mockReturnValue(queryChain({ modifiedCount: 1 })),
      exists: jest.fn().mockReturnValue(queryChain(null)),
    };
    groupModel = {
      countDocuments: jest.fn().mockReturnValue(queryChain(1)),
    };
    departmentModel = {
      findById: jest.fn().mockReturnValue(queryChain(null)),
      find: jest.fn().mockReturnValue(queryChain([])),
    };
    academicTerms = {
      getCurrent: jest.fn().mockResolvedValue({ _id: fixtureTermId }),
      requireCurrent: jest.fn().mockResolvedValue({ _id: fixtureTermId }),
      findById: jest.fn().mockResolvedValue({ _id: fixtureTermId }),
    };
    selectionModel = {
      find: jest.fn().mockReturnValue(queryChain([])),
      findOne: jest.fn().mockReturnValue(queryChain(null)),
      findOneAndDelete: jest.fn().mockReturnValue(queryChain(null)),
      findOneAndUpdate: jest.fn().mockReturnValue(queryChain(null)),
      distinct: jest.fn().mockReturnValue(queryChain([])),
      findById: jest.fn().mockReturnValue(
        queryChain({
          _id: new Types.ObjectId('6622b2a00f3a22d5b625d186'),
          period: period._id,
          discipline,
          student: studentId,
          group: period.targetGroups[0],
          selectedAt: new Date('2026-01-02T00:00:00.000Z'),
        }),
      ),
      countDocuments: jest.fn().mockReturnValue(queryChain(0)),
      create: jest.fn().mockResolvedValue({
        _id: new Types.ObjectId('6622b2a00f3a22d5b625d186'),
      }),
      updateMany: jest.fn().mockReturnValue(queryChain({ modifiedCount: 1 })),
    };
    courseModel = {
      findOneAndUpdate: jest.fn().mockReturnValue(
        queryChain({
          _id: new Types.ObjectId('6622b2a00f3a22d5b625d190'),
          code: discipline.code,
          department: discipline.department,
          credits: discipline.credits,
        }),
      ),
    };
    courseAssignmentModel = {
      find: jest.fn().mockReturnValue(queryChain([])),
      findOne: jest.fn().mockReturnValue(queryChain(null)),
      findOneAndUpdate: jest.fn().mockReturnValue(
        queryChain({
          _id: new Types.ObjectId('6622b2a00f3a22d5b625d191'),
          course: new Types.ObjectId('6622b2a00f3a22d5b625d190'),
          group: new Types.ObjectId(groupId),
          enrolledStudents: [studentId],
        }),
      ),
    };
    userModel = {
      find: jest.fn().mockReturnValue(queryChain([])),
      countDocuments: jest.fn().mockReturnValue(queryChain(0)),
    };
    usersService = {
      findOne: jest.fn().mockResolvedValue({
        id: studentId.toHexString(),
        login: 'student1',
        email: 'student@example.com',
        role: Role.STUDENT,
        firstName: 'Test',
        lastName: 'Student',
        status: 'active',
        studentProfiles: [
          {
            id: '6622b2a00f3a22d5b625d189',
            group: { id: groupId },
            recordBookNumber: 'RB-1',
            year: 3,
            status: 'active',
            syncedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        activeStudentProfileId: '6622b2a00f3a22d5b625d189',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
      getActiveStudentProfile: jest.fn().mockResolvedValue({
        _id: new Types.ObjectId('6622b2a00f3a22d5b625d189'),
        group: { _id: new Types.ObjectId(groupId), code: 'КН-31' },
        recordBookNumber: 'RB-1',
        year: 3,
        status: 'active',
        syncedAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
    };

    notificationsService = { createMany: jest.fn() };

    service = new ElectiveDisciplinesService(
      disciplineModel as never,
      periodModel as never,
      selectionModel as never,
      courseModel as never,
      courseAssignmentModel as never,
      departmentModel as never,
      groupModel as never,
      userModel as never,
      usersService as unknown as UsersService,
      notificationsService as unknown as NotificationsService,
      academicTerms as unknown as AcademicTermsService,
      { get: jest.fn() } as unknown as ConfigService,
    );
  });

  it('returns active periods targeted to the student group with remaining choices', async () => {
    const result = await service.findActiveForStudent({
      sub: studentId.toHexString(),
      login: 'student1',
      role: Role.STUDENT,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({
        selectedCount: 0,
        remainingChoices: 1,
      }),
    );
    expect(result[0].disciplines[0]).toEqual(
      expect.objectContaining({
        code: 'EL-CYB-01',
        availableSeats: 2,
      }),
    );
  });

  it('returns an empty list without a current academic term', async () => {
    academicTerms.getCurrent.mockResolvedValue(null);

    const result = await service.findActiveForStudent({
      sub: studentId.toHexString(),
      login: 'student1',
      role: Role.STUDENT,
    });

    expect(result).toEqual([]);
    expect(periodModel.find).not.toHaveBeenCalled();
  });

  it('selects a discipline and reserves capacity atomically', async () => {
    const record = jest
      .fn<Promise<void>, [DomainAuditEvent]>()
      .mockResolvedValue(undefined);
    const audit = { record };
    const result = await service.selectDiscipline(
      period._id.toString(),
      { disciplineId: discipline._id.toString() },
      {
        sub: studentId.toHexString(),
        login: 'student1',
        role: Role.STUDENT,
      },
      audit,
    );

    expect(disciplineModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: discipline._id,
        $expr: { $lt: ['$enrolledCount', '$capacity'] },
      }),
      { $inc: { enrolledCount: 1 } },
      { returnDocument: 'after' },
    );
    expect(selectionModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        period: period._id,
        discipline: discipline._id,
        student: studentId,
        choiceSlot: 0,
      }),
    );
    expect(result.discipline.id).toBe(discipline._id.toString());
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'elective.selection.select',
        targetEntity: 'elective_selection',
      }),
    );
    expect(record.mock.calls[0][0].details).toMatchObject({
      periodId: period._id.toString(),
      disciplineId: discipline._id.toString(),
    });
  });

  it('keeps the reserved seat when selection creation committed but reload fails', async () => {
    selectionModel.findById.mockReturnValueOnce(queryChain(null));

    await expect(
      service.selectDiscipline(
        period._id.toString(),
        { disciplineId: discipline._id.toString() },
        {
          sub: studentId.toHexString(),
          login: 'student1',
          role: Role.STUDENT,
        },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(selectionModel.create).toHaveBeenCalledTimes(1);
    expect(disciplineModel.updateOne).not.toHaveBeenCalled();
  });

  it('rejects duplicate selections before reserving another seat', async () => {
    selectionModel.find.mockReturnValueOnce(
      queryChain([
        {
          discipline: discipline._id,
          choiceSlot: 0,
        },
      ]),
    );

    await expect(
      service.selectDiscipline(
        period._id.toString(),
        { disciplineId: discipline._id.toString() },
        {
          sub: studentId.toHexString(),
          login: 'student1',
          role: Role.STUDENT,
        },
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(disciplineModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects selections when period is not targeted to the student group', async () => {
    usersService.findOne.mockResolvedValueOnce({
      id: studentId.toHexString(),
      login: 'student1',
      email: 'student@example.com',
      role: Role.STUDENT,
      firstName: 'Test',
      lastName: 'Student',
      status: 'active',
      studentProfiles: [
        {
          id: '6622b2a00f3a22d5b625d18a',
          group: { id: '6622b2a00f3a22d5b625d187' },
          recordBookNumber: 'RB-1',
          year: 3,
          status: 'active',
          syncedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      activeStudentProfileId: '6622b2a00f3a22d5b625d18a',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    await expect(
      service.selectDiscipline(
        period._id.toString(),
        { disciplineId: discipline._id.toString() },
        {
          sub: studentId.toHexString(),
          login: 'student1',
          role: Role.STUDENT,
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects selection when no capacity can be reserved', async () => {
    disciplineModel.findOneAndUpdate.mockReturnValueOnce(queryChain(null));

    await expect(
      service.selectDiscipline(
        period._id.toString(),
        { disciplineId: discipline._id.toString() },
        {
          sub: studentId.toHexString(),
          login: 'student1',
          role: Role.STUDENT,
        },
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(selectionModel.create).not.toHaveBeenCalled();
  });

  it('throws not found for missing discipline ids', async () => {
    disciplineModel.findById.mockReturnValueOnce(queryChain(null));

    await expect(
      service.selectDiscipline(
        period._id.toString(),
        { disciplineId: discipline._id.toString() },
        {
          sub: studentId.toHexString(),
          login: 'student1',
          role: Role.STUDENT,
        },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('finalizes a closed period into course assignments', async () => {
    const record = jest
      .fn<Promise<void>, [DomainAuditEvent]>()
      .mockResolvedValue(undefined);
    const audit = { record };
    const closedPeriod = createPeriod({
      status: ElectiveSelectionPeriodStatus.CLOSED,
      closedAt: new Date('2026-01-10T00:00:00.000Z'),
    });
    const teacherId = new Types.ObjectId('6622b2a00f3a22d5b625d188');
    const finalizedDiscipline = createDiscipline({ teacher: teacherId });
    const departmentId = new Types.ObjectId('6622b2a00f3a22d5b625d181');
    const selectionId = new Types.ObjectId('6622b2a00f3a22d5b625d189');
    const selection = {
      _id: selectionId,
      period: closedPeriod._id,
      discipline: finalizedDiscipline,
      student: {
        _id: studentId,
        login: 'student1',
        firstName: 'Test',
        lastName: 'Student',
      },
      group: closedPeriod.targetGroups[0],
      selectedAt: new Date('2026-01-02T00:00:00.000Z'),
    };

    const finalizedPeriod = createPeriod({
      ...closedPeriod,
      status: ElectiveSelectionPeriodStatus.FINALIZED,
      finalizedAt: new Date('2026-01-10T00:05:00.000Z'),
    });
    periodModel.findOneAndUpdate
      .mockReturnValueOnce(queryChain(closedPeriod))
      .mockReturnValueOnce(queryChain(finalizedPeriod));
    periodModel.findById.mockReturnValue(queryChain(finalizedPeriod));
    selectionModel.find.mockReturnValueOnce(queryChain([selection]));
    userModel.find.mockReturnValueOnce(
      queryChain([
        {
          _id: teacherId,
          teacherProfile: { department: departmentId },
        },
      ]),
    );

    const result = await service.finalizePeriod(
      closedPeriod._id.toString(),
      {
        sub: '6622b2a00f3a22d5b625d182',
        login: 'dean1',
        role: Role.DEAN,
      },
      audit,
    );

    const courseCall = courseModel.findOneAndUpdate.mock.calls[0] as [
      Record<string, unknown>,
      { $setOnInsert?: Record<string, unknown> },
      Record<string, unknown>,
    ];
    expect(courseCall[0]).toEqual({ code: finalizedDiscipline.code });
    expect(courseCall[1].$setOnInsert).toMatchObject({
      name: finalizedDiscipline.title,
      code: finalizedDiscipline.code,
    });
    expect(courseCall[2]).toMatchObject({ upsert: true });
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'elective.period.finalize',
        targetEntity: 'elective_period',
        targetId: closedPeriod._id.toString(),
      }),
    );
    expect(record.mock.calls[0][0].details).toMatchObject({
      before: { status: ElectiveSelectionPeriodStatus.CLOSED },
      after: { status: ElectiveSelectionPeriodStatus.FINALIZED },
    });

    const assignmentCall = courseAssignmentModel.findOneAndUpdate.mock
      .calls[0] as [
      Record<string, unknown>,
      { $addToSet?: { enrolledStudents?: { $each?: Types.ObjectId[] } } },
      Record<string, unknown>,
    ];
    expect(assignmentCall[0].course).toBeInstanceOf(Types.ObjectId);
    expect(assignmentCall[0].group).toBeInstanceOf(Types.ObjectId);
    expect(assignmentCall[0].term).toEqual(fixtureTermId);
    expect(assignmentCall[1].$addToSet?.enrolledStudents?.$each).toEqual([
      studentId,
    ]);
    expect(assignmentCall[2]).toMatchObject({ upsert: true });

    const selectionCall = selectionModel.updateMany.mock.calls[0] as [
      Record<string, unknown>,
      { $set?: Record<string, unknown> },
    ];
    expect(selectionCall[0]).toEqual({ _id: { $in: [selectionId] } });
    expect(selectionCall[1].$set?.courseAssignment).toBeInstanceOf(
      Types.ObjectId,
    );
    expect(selectionCall[1].$set?.finalizedAt).toBeInstanceOf(Date);
    expect(selectionCall[1].$set?.finalizedBy).toBeInstanceOf(Types.ObjectId);
    expect(result.period.status).toBe(ElectiveSelectionPeriodStatus.FINALIZED);
    expect(result.courseAssignments).toHaveLength(1);
  });

  it('rejects finalization when the matching course is archived', async () => {
    const record = jest
      .fn<Promise<void>, [DomainAuditEvent]>()
      .mockResolvedValue(undefined);
    const audit = { record };
    const closedPeriod = createPeriod({
      status: ElectiveSelectionPeriodStatus.CLOSED,
      closedAt: new Date('2026-01-10T00:00:00.000Z'),
    });
    const teacherId = new Types.ObjectId('6622b2a00f3a22d5b625d188');
    const finalizedDiscipline = createDiscipline({ teacher: teacherId });
    const departmentId = new Types.ObjectId('6622b2a00f3a22d5b625d181');
    const selectionId = new Types.ObjectId('6622b2a00f3a22d5b625d189');
    const selection = {
      _id: selectionId,
      period: closedPeriod._id,
      discipline: finalizedDiscipline,
      student: {
        _id: studentId,
        login: 'student1',
        firstName: 'Test',
        lastName: 'Student',
      },
      group: closedPeriod.targetGroups[0],
      selectedAt: new Date('2026-01-02T00:00:00.000Z'),
    };

    const finalizedPeriod = createPeriod({
      ...closedPeriod,
      status: ElectiveSelectionPeriodStatus.FINALIZED,
      finalizedAt: new Date('2026-01-10T00:05:00.000Z'),
    });
    periodModel.findOneAndUpdate
      .mockReturnValueOnce(queryChain(closedPeriod))
      .mockReturnValueOnce(queryChain(finalizedPeriod));
    periodModel.findById.mockReturnValue(queryChain(finalizedPeriod));
    selectionModel.find.mockReturnValueOnce(queryChain([selection]));
    userModel.find.mockReturnValueOnce(
      queryChain([
        {
          _id: teacherId,
          teacherProfile: { department: departmentId },
        },
      ]),
    );
    courseModel.findOneAndUpdate.mockReturnValueOnce(
      queryChain({ status: 'archived', code: 'EL-1' }),
    );

    await expect(
      service.finalizePeriod(
        closedPeriod._id.toString(),
        {
          sub: '6622b2a00f3a22d5b625d182',
          login: 'dean1',
          role: Role.DEAN,
        },
        audit,
      ),
    ).rejects.toThrow(ConflictException);

    expect(courseAssignmentModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('createPeriod without termId uses the current academic term', async () => {
    const currentTermId = new Types.ObjectId('6622b2a00f3a22d5b625d1a1');
    academicTerms.requireCurrent.mockResolvedValue({ _id: currentTermId });

    await service.createPeriod(
      {
        title: 'Осінь',
        startsAt: '2026-10-01',
        endsAt: '2026-10-15',
        targetGroupIds: [groupId],
        requiredChoices: 1,
      },
      {
        sub: '6622b2a00f3a22d5b625d182',
        login: 'dean1',
        role: Role.DEAN,
      },
    );

    expect(periodModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ term: currentTermId }),
    );
  });

  it('select rejects a discipline from another academic term', async () => {
    const otherTermId = new Types.ObjectId('6622b2a00f3a22d5b625d1a2');
    disciplineModel.findById.mockReturnValueOnce(
      queryChain(
        createDiscipline({
          term: {
            _id: otherTermId,
            academicYear: '2025/2026',
            termNumber: 2,
          },
        }),
      ),
    );

    await expect(
      service.selectDiscipline(
        period._id.toString(),
        { disciplineId: discipline._id.toString() },
        {
          sub: studentId.toHexString(),
          login: 'student1',
          role: Role.STUDENT,
        },
      ),
    ).rejects.toThrow(
      'Дисципліна не належить до навчального періоду цього періоду вибору',
    );
  });

  describe('cancelDiscipline', () => {
    it('rejects cancellation when the discipline belongs to a finalized period', async () => {
      const cancelDiscipline = createDiscipline({
        status: ElectiveDisciplineStatus.ACTIVE,
      });
      disciplineModel.findById.mockReturnValue(queryChain(cancelDiscipline));
      selectionModel.distinct.mockReturnValue(
        queryChain([new Types.ObjectId()]),
      );
      periodModel.exists.mockReturnValue(
        queryChain({ _id: new Types.ObjectId() }),
      ); // finalized
      await expect(
        service.cancelDiscipline(
          cancelDiscipline._id.toHexString(),
          'Викладач звільнився',
          admin,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(selectionModel.updateMany).not.toHaveBeenCalled();
    });

    it('cascades cancellation to selected selections and notifies students', async () => {
      const cancelDiscipline = createDiscipline({
        status: ElectiveDisciplineStatus.ACTIVE,
      });
      disciplineModel.findById.mockReturnValue(queryChain(cancelDiscipline));
      selectionModel.distinct.mockReturnValue(
        queryChain([new Types.ObjectId()]),
      );
      periodModel.exists.mockReturnValue(queryChain(null));
      selectionModel.find.mockReturnValue(
        queryChain([
          {
            _id: new Types.ObjectId(),
            student: new Types.ObjectId(),
            status: ElectiveSelectionStatus.SELECTED,
          },
        ]),
      );
      selectionModel.updateMany.mockReturnValue(
        queryChain({ modifiedCount: 1 }),
      );
      disciplineModel.updateOne.mockReturnValue(
        queryChain({ modifiedCount: 1 }),
      );
      userModel.find.mockReturnValue(queryChain([]));
      const record = jest
        .fn<Promise<void>, [DomainAuditEvent]>()
        .mockResolvedValue(undefined);
      const audit = { record };

      await service.cancelDiscipline(
        cancelDiscipline._id.toHexString(),
        'Викладач звільнився',
        admin,
        audit,
      );

      const [updateFilter, updateOp] = selectionModel.updateMany.mock
        .calls[0] as [
        Record<string, unknown>,
        { $set: Record<string, unknown> },
      ];
      expect(updateFilter).toMatchObject({
        discipline: cancelDiscipline._id,
        status: ElectiveSelectionStatus.SELECTED,
      });
      expect(updateOp.$set).toMatchObject({
        status: ElectiveSelectionStatus.CANCELLED,
        cancelReason: 'discipline_cancelled',
      });
      expect(notificationsService.createMany).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            type: NotificationType.ELECTIVE,
            actionUrl: '/electives',
          }),
        ]),
      );
      expect(record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AUDIT_ACTIONS.ELECTIVE_DISCIPLINE_STATUS_CHANGE,
        }),
      );
      const [cancelEvent] = record.mock.calls[0];
      expect(cancelEvent.details).toMatchObject({
        before: { status: 'active' },
        after: { status: 'cancelled' },
        reason: 'Викладач звільнився',
        affectedSelections: 1,
      });
      // §8/AUD-003: no student list in the payload
      expect(Object.keys(cancelEvent.details ?? {})).not.toContain('students');
    });
  });

  describe('setDisciplineStatus (не-cancel гілки)', () => {
    it('audits archiving with before/after', async () => {
      const archivedDiscipline = createDiscipline({
        status: ElectiveDisciplineStatus.ACTIVE,
      });
      disciplineModel.findById.mockReturnValue(queryChain(archivedDiscipline));
      const record = jest
        .fn<Promise<void>, [DomainAuditEvent]>()
        .mockResolvedValue(undefined);
      const audit = { record };

      await service.setDisciplineStatus(
        archivedDiscipline._id.toHexString(),
        { status: ElectiveDisciplineStatus.ARCHIVED },
        admin,
        audit,
      );

      expect(record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AUDIT_ACTIONS.ELECTIVE_DISCIPLINE_STATUS_CHANGE,
        }),
      );
      const [archiveEvent] = record.mock.calls[0];
      expect(archiveEvent.details).toMatchObject({
        before: { status: 'active' },
        after: { status: 'archived' },
      });
    });
  });

  describe('cancelSelection', () => {
    it('marks selection cancelled instead of deleting', async () => {
      const cancelPeriod = createPeriod();
      periodModel.findById.mockReturnValue(queryChain(cancelPeriod));
      const selection = {
        _id: new Types.ObjectId(),
        discipline: new Types.ObjectId(),
        group: new Types.ObjectId(),
        choiceSlot: 0,
      };
      selectionModel.findOneAndUpdate.mockReturnValue(queryChain(selection));
      disciplineModel.updateOne.mockReturnValue(
        queryChain({ modifiedCount: 1 }),
      );

      await service.cancelSelection(
        cancelPeriod._id.toHexString(),
        selection._id.toHexString(),
        student,
      );

      expect(selectionModel.findOneAndDelete).not.toHaveBeenCalled();
      const [updateFilter, updateOp] = selectionModel.findOneAndUpdate.mock
        .calls[0] as [
        Record<string, unknown>,
        { $set: Record<string, unknown> },
      ];
      expect(updateFilter).toMatchObject({
        status: ElectiveSelectionStatus.SELECTED,
      });
      expect(updateOp.$set).toMatchObject({
        status: ElectiveSelectionStatus.CANCELLED,
        cancelReason: 'student',
      });
    });
  });
});
