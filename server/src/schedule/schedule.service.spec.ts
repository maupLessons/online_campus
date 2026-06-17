import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { SpreadsheetExportFormat } from '../common/export';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { Role } from '../common/types/roles.enum';
import { NotificationType } from '../notifications/dto/create-notification.dto';
import { ScheduleExportService } from './schedule-export.service';
import { ScheduleMapper } from './schedule.mapper';
import { ScheduleMutationService } from './schedule-mutation.service';
import { ScheduleNotificationsService } from './schedule-notifications.service';
import { ScheduleReaderService } from './schedule-reader.service';
import { ScheduleService } from './schedule.service';
import { ScheduleTemplatesService } from './schedule-templates.service';
import { ScheduleValidationService } from './schedule-validation.service';
import { ScheduleEntryStatus, ScheduleEntryType } from './schedule.enums';
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

type ScheduleTemplateModelMock = {
  find: jest.Mock;
  findById: jest.Mock;
  create: jest.Mock;
  updateOne: jest.Mock;
};

type CourseAssignmentModelMock = {
  find: jest.Mock;
  findById: jest.Mock;
};

type ClassroomModelMock = {
  exists: jest.Mock;
};

type NotificationsServiceMock = {
  createMany: jest.Mock;
};

type AcademicAccessServiceMock = {
  findVisibleCourseAssignmentIds: jest.Mock;
  canAccessCourseAssignment: jest.Mock;
  findCourseAssignmentRecipientIds: jest.Mock;
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
  let scheduleTemplateModel: ScheduleTemplateModelMock;
  let courseAssignmentModel: CourseAssignmentModelMock;
  let classroomModel: ClassroomModelMock;
  let notificationsService: NotificationsServiceMock;
  let academicAccessService: AcademicAccessServiceMock;
  let mapper: ScheduleMapper;
  let service: ScheduleService;

  beforeEach(() => {
    scheduleEntryModel = {
      find: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      countDocuments: jest.fn(),
      deleteOne: jest.fn(),
    };
    scheduleTemplateModel = {
      find: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      updateOne: jest.fn(),
    };
    courseAssignmentModel = {
      find: jest.fn(),
      findById: jest.fn(),
    };
    classroomModel = {
      exists: jest.fn(),
    };
    notificationsService = {
      createMany: jest.fn().mockResolvedValue([]),
    };
    academicAccessService = {
      findVisibleCourseAssignmentIds: jest.fn().mockResolvedValue([]),
      canAccessCourseAssignment: jest.fn().mockResolvedValue(false),
      findCourseAssignmentRecipientIds: jest.fn().mockResolvedValue([]),
    };
    mapper = new ScheduleMapper();
    const scheduleReader = new ScheduleReaderService(
      scheduleEntryModel as never,
      courseAssignmentModel as never,
      academicAccessService as never,
      mapper,
    );
    const scheduleNotifications = new ScheduleNotificationsService(
      notificationsService as never,
      academicAccessService as never,
    );
    const scheduleTemplates = new ScheduleTemplatesService(
      scheduleTemplateModel as never,
      courseAssignmentModel as never,
      classroomModel as never,
      mapper,
    );
    const scheduleValidation = new ScheduleValidationService(
      scheduleEntryModel as never,
      courseAssignmentModel as never,
      classroomModel as never,
      mapper,
    );
    const scheduleMutation = new ScheduleMutationService(
      scheduleEntryModel as never,
      mapper,
      scheduleReader,
      scheduleNotifications,
      scheduleTemplates,
      scheduleValidation,
    );

    service = new ScheduleService(
      scheduleReader,
      scheduleMutation,
      new ScheduleExportService(),
      scheduleTemplates,
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
    academicAccessService.findCourseAssignmentRecipientIds.mockResolvedValue([
      ids.teacher,
      ids.student,
    ]);
    classroomModel.exists.mockReturnValue(query({ _id: ids.classroom }));
    scheduleEntryModel.find.mockReturnValue(query([]));
    scheduleEntryModel.findById.mockReturnValue(query(scheduleEntry));
    scheduleEntryModel.create.mockResolvedValue({
      _id: objectId(ids.schedule),
    });

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

  it('returns only course assignments visible to an elective student', async () => {
    academicAccessService.findVisibleCourseAssignmentIds.mockResolvedValue([
      objectId(ids.assignment),
    ]);
    scheduleEntryModel.find.mockReturnValue(query([scheduleEntry]));

    const result = await service.findForUser(
      {
        sub: ids.student,
        login: 'student1',
        role: Role.STUDENT,
      },
      {},
    );

    expect(result).toHaveLength(1);
    expect(scheduleEntryModel.find).toHaveBeenCalledWith({
      courseAssignment: { $in: [objectId(ids.assignment)] },
    });
  });

  it('does not expose schedule entries when a student has no visible assignments', async () => {
    academicAccessService.findVisibleCourseAssignmentIds.mockResolvedValue([]);

    await expect(
      service.findForUser(
        {
          sub: ids.student,
          login: 'student1',
          role: Role.STUDENT,
        },
        {},
      ),
    ).resolves.toEqual([]);

    expect(scheduleEntryModel.find).not.toHaveBeenCalled();
  });

  it('rejects user schedule filters outside visible academic scope', async () => {
    academicAccessService.findVisibleCourseAssignmentIds.mockResolvedValue([
      objectId(ids.assignment),
    ]);
    courseAssignmentModel.find.mockReturnValue(
      query([{ _id: objectId(ids.scheduleConflict) }]),
    );

    await expect(
      service.findForUser(
        {
          sub: ids.student,
          login: 'student1',
          role: Role.STUDENT,
        },
        { groupId: ids.group },
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(scheduleEntryModel.find).not.toHaveBeenCalled();
  });

  it('cancels schedule entries with reason, notifications and audit trail', async () => {
    const record = jest
      .fn<Promise<void>, [DomainAuditEvent]>()
      .mockResolvedValue(undefined);
    const audit = { record };
    const mutableEntry = {
      status: ScheduleEntryStatus.SCHEDULED,
      changeHistory: [],
      set: jest.fn(function set(values: Record<string, unknown>) {
        Object.assign(this, values);
      }),
      save: jest.fn().mockResolvedValue(undefined),
    };
    const cancelledEntry = {
      ...scheduleEntry,
      status: ScheduleEntryStatus.CANCELLED,
      changeReason: 'Викладач захворів',
      cancelledAt: new Date('2026-09-01T07:00:00.000Z'),
    };

    scheduleEntryModel.findById
      .mockReturnValueOnce(query(mutableEntry))
      .mockReturnValueOnce(query(scheduleEntry))
      .mockReturnValueOnce(query(cancelledEntry));
    academicAccessService.findCourseAssignmentRecipientIds.mockResolvedValue([
      ids.teacher,
      ids.student,
    ]);

    const result = await service.cancel(
      ids.schedule,
      { reason: 'Викладач захворів' },
      audit,
      {
        sub: ids.teacher,
        login: 'teacher1',
        role: Role.DISPATCHER,
      },
    );

    expect(result.status).toBe(ScheduleEntryStatus.CANCELLED);
    expect(mutableEntry.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: ScheduleEntryStatus.CANCELLED,
        changeReason: 'Викладач захворів',
      }),
    );
    expect(mutableEntry.changeHistory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'cancelled',
          reason: 'Викладач захворів',
          actorLogin: 'teacher1',
        }),
      ]),
    );
    expect(notificationsService.createMany).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          userId: ids.student,
          important: true,
          entityType: 'schedule',
          actionUrl: '/schedule',
        }),
      ]),
    );
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'schedule.cancel',
        targetId: ids.schedule,
      }),
    );
  });

  it('exports scoped schedule CSV and neutralizes spreadsheet formulas', async () => {
    const user: AuthenticatedUser = {
      sub: ids.teacher,
      login: 'teacher',
      role: Role.ADMIN,
    };

    scheduleEntryModel.find.mockReturnValue(query([scheduleEntry]));

    const exportArtifact = await service.exportCsv(user, {});
    const csv = exportArtifact.buffer.toString('utf8');

    expect(exportArtifact.filename).toBe('schedule.csv');
    expect(exportArtifact.contentType).toBe('text/csv; charset=utf-8');
    expect(csv).toContain('Дата;Початок;Завершення');
    expect(csv).toContain("'=SEC101");
    expect(csv).toContain('Основи кібербезпеки');
  });

  it('exports scoped schedule XLSX through the shared spreadsheet pipeline', async () => {
    const user: AuthenticatedUser = {
      sub: ids.teacher,
      login: 'teacher',
      role: Role.ADMIN,
    };

    scheduleEntryModel.find.mockReturnValue(query([scheduleEntry]));

    const exportArtifact = await service.export(user, {
      format: SpreadsheetExportFormat.XLSX,
    });

    expect(exportArtifact.filename).toBe('schedule.xlsx');
    expect(exportArtifact.contentType).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(exportArtifact.buffer.length).toBeGreaterThan(0);
  });
});
