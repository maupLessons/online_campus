import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { Role } from '../common/types/roles.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import { ElectiveDisciplinesService } from './elective-disciplines.service';
import {
  ElectiveDisciplineStatus,
  ElectiveSelectionPeriodStatus,
} from './schemas';

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
    semester: 3,
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
    academicYear: '2026/2027',
    semester: 3,
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
    updateMany: jest.Mock;
    updateOne: jest.Mock;
  };
  let selectionModel: {
    find: jest.Mock;
    findOne: jest.Mock;
    findOneAndDelete: jest.Mock;
    findById: jest.Mock;
    countDocuments: jest.Mock;
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
  let usersService: jest.Mocked<Pick<UsersService, 'findOne'>>;

  const studentId = new Types.ObjectId('6622b2a00f3a22d5b625d185');
  const groupId = '6622b2a00f3a22d5b625d184';
  const period = createPeriod();
  const discipline = createDiscipline();

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
      findOneAndUpdate: jest.fn().mockReturnValue(queryChain(period)),
      updateMany: jest.fn().mockReturnValue(queryChain({ modifiedCount: 0 })),
      updateOne: jest.fn().mockReturnValue(queryChain({ modifiedCount: 1 })),
    };
    selectionModel = {
      find: jest.fn().mockReturnValue(queryChain([])),
      findOne: jest.fn().mockReturnValue(queryChain(null)),
      findOneAndDelete: jest.fn().mockReturnValue(queryChain(null)),
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
          semester: discipline.semester,
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
        studentProfile: {
          group: groupId,
          recordBookNumber: 'RB-1',
          year: 3,
        },
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
    };

    service = new ElectiveDisciplinesService(
      disciplineModel as never,
      periodModel as never,
      selectionModel as never,
      courseModel as never,
      courseAssignmentModel as never,
      {} as never,
      {} as never,
      userModel as never,
      usersService as unknown as UsersService,
      { createMany: jest.fn() } as unknown as NotificationsService,
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

  it('selects a discipline and reserves capacity atomically', async () => {
    const result = await service.selectDiscipline(
      period._id.toString(),
      { disciplineId: discipline._id.toString() },
      {
        sub: studentId.toHexString(),
        login: 'student1',
        role: Role.STUDENT,
      },
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
      studentProfile: {
        group: '6622b2a00f3a22d5b625d187',
        recordBookNumber: 'RB-1',
        year: 3,
      },
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

    const result = await service.finalizePeriod(closedPeriod._id.toString(), {
      sub: '6622b2a00f3a22d5b625d182',
      login: 'dean1',
      role: Role.DEAN,
    });

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

    const assignmentCall = courseAssignmentModel.findOneAndUpdate.mock
      .calls[0] as [
      Record<string, unknown>,
      { $addToSet?: { enrolledStudents?: { $each?: Types.ObjectId[] } } },
      Record<string, unknown>,
    ];
    expect(assignmentCall[0].course).toBeInstanceOf(Types.ObjectId);
    expect(assignmentCall[0].group).toBeInstanceOf(Types.ObjectId);
    expect(assignmentCall[0]).toMatchObject({
      academicYear: closedPeriod.academicYear,
      semester: closedPeriod.semester,
    });
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
});
