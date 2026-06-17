import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { DomainAuditEvent } from '../audit-log/audit-context';
import { AUDIT_ACTIONS } from '../audit-log/audit-actions';
import { Role } from '../common/types/roles.enum';
import { ScheduleEntryStatus, ScheduleEntryType } from './schedule.enums';
import { ScheduleMapper } from './schedule.mapper';
import { ScheduleMutationService } from './schedule-mutation.service';

describe('ScheduleMutationService', () => {
  const ids = {
    assignment: '6622b2a00f3a22d5b625e401',
    classroom: '6622b2a00f3a22d5b625e501',
    teacher: '6622b2a00f3a22d5b625e111',
    group: '6622b2a00f3a22d5b625e201',
  };

  let scheduleEntryModel: {
    create: jest.Mock;
    findById: jest.Mock;
    deleteOne: jest.Mock;
  };
  let scheduleReader: {
    getPopulatedEntryOrThrow: jest.Mock;
  };
  let scheduleNotifications: {
    notifyScheduleChanged: jest.Mock;
  };
  let scheduleTemplates: {
    getTemplateOrThrow: jest.Mock;
    getTemplateDates: jest.Mock;
  };
  let scheduleValidation: {
    normalizePayload: jest.Mock;
    assertNoConflicts: jest.Mock;
  };
  let service: ScheduleMutationService;

  beforeEach(() => {
    scheduleEntryModel = {
      create: jest.fn(),
      findById: jest.fn(),
      deleteOne: jest.fn(),
    };
    scheduleReader = {
      getPopulatedEntryOrThrow: jest.fn(),
    };
    scheduleNotifications = {
      notifyScheduleChanged: jest.fn(),
    };
    scheduleTemplates = {
      getTemplateOrThrow: jest.fn(),
      getTemplateDates: jest.fn(),
    };
    scheduleValidation = {
      normalizePayload: jest.fn(),
      assertNoConflicts: jest.fn(),
    };

    service = new ScheduleMutationService(
      scheduleEntryModel as never,
      new ScheduleMapper(),
      scheduleReader as never,
      scheduleNotifications as never,
      scheduleTemplates as never,
      scheduleValidation as never,
    );
  });

  it('rejects empty substitutions before loading mutable schedule state', async () => {
    await expect(
      service.substitute('6622b2a00f3a22d5b625e601', {
        reason: 'Заміна без змін',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(scheduleEntryModel.findById).not.toHaveBeenCalled();
    expect(scheduleValidation.normalizePayload).not.toHaveBeenCalled();
  });

  it('validates dry-run bulk creates without persisting entries', async () => {
    scheduleValidation.normalizePayload.mockResolvedValue({
      courseAssignmentId: ids.assignment,
      classroomId: ids.classroom,
      date: new Date('2026-09-01T00:00:00.000Z'),
      dateString: '2026-09-01',
      startTime: '08:30',
      endTime: '10:05',
      type: ScheduleEntryType.LECTURE,
      status: ScheduleEntryStatus.SCHEDULED,
      assignment: {
        _id: new Types.ObjectId(ids.assignment),
        teacher: new Types.ObjectId(ids.teacher),
        group: new Types.ObjectId(ids.group),
      },
    });
    scheduleValidation.assertNoConflicts.mockResolvedValue(undefined);
    const record = jest
      .fn<Promise<void>, [DomainAuditEvent]>()
      .mockResolvedValue(undefined);
    const audit = { record };

    const result = await service.bulkCreate(
      {
        dryRun: true,
        entries: [
          {
            courseAssignmentId: ids.assignment,
            classroomId: ids.classroom,
            date: '2026-09-01',
            startTime: '08:30',
            endTime: '10:05',
            type: ScheduleEntryType.LECTURE,
          },
        ],
      },
      audit,
      { sub: ids.teacher, login: 'teacher', role: Role.TEACHER },
    );

    expect(result).toMatchObject({
      dryRun: true,
      created: 0,
      skipped: 0,
      items: [{ index: 0, success: true }],
    });
    expect(scheduleEntryModel.create).not.toHaveBeenCalled();
    expect(record).toHaveBeenCalledTimes(1);
    const auditEvent = record.mock.calls[0]?.[0];
    expect(auditEvent?.action).toBe(AUDIT_ACTIONS.SCHEDULE_BULK_CREATE);
    expect(auditEvent?.details).toMatchObject({
      dryRun: true,
      total: 1,
    });
  });
});
