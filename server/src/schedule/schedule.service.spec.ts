import { ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { Role } from '../common/types/roles.enum';
import { NotificationType } from '../notifications/dto/create-notification.dto';
import { ScheduleService } from './schedule.service';
import { ScheduleEntryStatus, ScheduleEntryType } from './schemas';
import { DomainAuditEvent } from '../audit-log/audit-context';

type QueryChain<T> = {
  populate: jest.Mock<QueryChain<T>, [unknown?]>;
  select: jest.Mock<QueryChain<T>, [unknown?]>;
  sort: jest.Mock<QueryChain<T>, [unknown?]>;
  lean: jest.Mock<QueryChain<T>, []>;
  exec: jest.Mock<Promise<T>, []>;
};

type ScheduleEntryModelMock = {
  find: jest.Mock;
  findById: jest.Mock;
  create: jest.Mock;
  countDocuments: jest.Mock;
  deleteOne: jest.Mock;
};

type CourseAssignmentModelMock = {
  find: jest.Mock;
  findById: jest.Mock;
};

type ClassroomModelMock = {
  exists: jest.Mock;
};

type UserModelMock = {
  find: jest.Mock;
  findById: jest.Mock;
};

type NotificationsServiceMock = {
  createMany: jest.Mock;
};

function query<T>(result: T): QueryChain<T> {
  const chain = {} as QueryChain<T>;
  chain.populate = jest.fn<QueryChain<T>, [unknown?]>().mockReturnValue(chain);
  chain.select = jest.fn<QueryChain<T>, [unknown?]>().mockReturnValue(chain);
  chain.sort = jest.fn<QueryChain<T>, [unknown?]>().mockReturnValue(chain);
  chain.lean = jest.fn<QueryChain<T>, []>().mockReturnValue(chain);
  chain.exec = jest.fn<Promise<T>, []>().mockResolvedValue(result);
  return chain;
}

function objectId(hex: string): Types.ObjectId {
  return new Types.ObjectId(hex);
}

describe('ScheduleService', () => {
  const ids = {
    schedule: '6622b2a00f3a22d5b625e601',
    scheduleConflict: '6622b2a00f3a22d5b625e602',
    assignment: '6622b2a00f3a22d5b625e401',
    course: '6622b2a00f3a22d5b625e301',
    group: '6622b2a00f3a22d5b625e201',
    classroom: '6622b2a00f3a22d5b625e501',
    teacher: '6622b2a00f3a22d5b625e111',
    student: '6622b2a00f3a22d5b625e101',
  };

  const assignment = {
    _id: objectId(ids.assignment),
    course: {
      _id: objectId(ids.course),
      name: 'Основи кібербезпеки',
      code: '=SEC101',
    },
    group: {
      _id: objectId(ids.group),
      code: 'КН-11',
    },
    teacher: {
      _id: objectId(ids.teacher),
      firstName: 'Ірина',
      lastName: 'Коваленко',
    },
  };

  const scheduleEntry = {
    _id: objectId(ids.schedule),
    courseAssignment: assignment,
    classroom: {
      _id: objectId(ids.classroom),
      building: 'Корпус 1',
      roomNumber: '101',
    },
    date: new Date('2026-09-01T00:00:00.000Z'),
    startTime: '08:30',
    endTime: '10:05',
    type: ScheduleEntryType.LECTURE,
    status: ScheduleEntryStatus.SCHEDULED,
  };

  let scheduleEntryModel: ScheduleEntryModelMock;
  let courseAssignmentModel: CourseAssignmentModelMock;
  let classroomModel: ClassroomModelMock;
  let userModel: UserModelMock;
  let notificationsService: NotificationsServiceMock;
  let service: ScheduleService;

  beforeEach(() => {
    scheduleEntryModel = {
      find: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      countDocuments: jest.fn(),
      deleteOne: jest.fn(),
    };
    courseAssignmentModel = {
      find: jest.fn(),
      findById: jest.fn(),
    };
    classroomModel = {
      exists: jest.fn(),
    };
    userModel = {
      find: jest.fn(),
      findById: jest.fn(),
    };
    notificationsService = {
      createMany: jest.fn().mockResolvedValue([]),
    };

    service = new ScheduleService(
      scheduleEntryModel as never,
      courseAssignmentModel as never,
      classroomModel as never,
      userModel as never,
      notificationsService as never,
    );
  });

  it('rejects overlapping teacher, classroom, or group conflicts', async () => {
    courseAssignmentModel.findById.mockReturnValue(query(assignment));
    classroomModel.exists.mockReturnValue(query({ _id: ids.classroom }));
    scheduleEntryModel.find.mockReturnValue(
      query([
        {
          ...scheduleEntry,
          _id: objectId(ids.scheduleConflict),
        },
      ]),
    );

    await expect(
      service.create({
        courseAssignmentId: ids.assignment,
        classroomId: ids.classroom,
        date: '2026-09-01',
        startTime: '09:00',
        endTime: '10:30',
        type: ScheduleEntryType.SEMINAR,
      }),
    ).rejects.toThrow(ConflictException);

    expect(scheduleEntryModel.create).not.toHaveBeenCalled();
  });

  it('creates targeted notifications after schedule creation', async () => {
    const record = jest
      .fn<Promise<void>, [DomainAuditEvent]>()
      .mockResolvedValue(undefined);
    const audit = { record };
    courseAssignmentModel.findById.mockReturnValue(query(assignment));
    courseAssignmentModel.find.mockReturnValue(
      query([
        {
          _id: objectId(ids.assignment),
          teacher: objectId(ids.teacher),
          group: objectId(ids.group),
        },
      ]),
    );
    classroomModel.exists.mockReturnValue(query({ _id: ids.classroom }));
    scheduleEntryModel.find.mockReturnValue(query([]));
    scheduleEntryModel.findById.mockReturnValue(query(scheduleEntry));
    scheduleEntryModel.create.mockResolvedValue({
      _id: objectId(ids.schedule),
    });
    userModel.find.mockReturnValue(query([{ _id: objectId(ids.student) }]));

    await service.create(
      {
        courseAssignmentId: ids.assignment,
        classroomId: ids.classroom,
        date: '2026-09-01',
        startTime: '08:30',
        endTime: '10:05',
        type: ScheduleEntryType.LECTURE,
      },
      audit,
    );

    expect(notificationsService.createMany).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          userId: ids.teacher,
          type: NotificationType.SCHEDULE_CHANGE,
        }),
        expect.objectContaining({
          userId: ids.student,
          type: NotificationType.SCHEDULE_CHANGE,
        }),
      ]),
    );
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'schedule.create',
        targetEntity: 'schedule',
        targetId: ids.schedule,
      }),
    );
    expect(record.mock.calls[0][0].details).toMatchObject({
      after: {
        courseAssignmentId: ids.assignment,
        date: '2026-09-01',
        startTime: '08:30',
        endTime: '10:05',
      },
    });
  });

  it('exports scoped schedule CSV and neutralizes spreadsheet formulas', async () => {
    const user: AuthenticatedUser = {
      sub: ids.teacher,
      login: 'teacher',
      role: Role.ADMIN,
    };

    scheduleEntryModel.find.mockReturnValue(query([scheduleEntry]));

    const csv = await service.exportCsv(user, {});

    expect(csv).toContain('date,start_time,end_time');
    expect(csv).toContain("'=SEC101");
    expect(csv).toContain('Основи кібербезпеки');
  });
});
