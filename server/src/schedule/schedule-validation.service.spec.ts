import { BadRequestException, ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ScheduleEntryStatus, ScheduleEntryType } from './schemas';
import { ScheduleMapper } from './schedule.mapper';
import { ScheduleValidationService } from './schedule-validation.service';

type ConflictResponse = {
  conflicts?: Array<{ type: string }>;
};

type QueryChain<T> = {
  populate: jest.Mock<QueryChain<T>, [unknown?]>;
  lean: jest.Mock<QueryChain<T>, []>;
  exec: jest.Mock<Promise<T>, []>;
};

function query<T>(result: T): QueryChain<T> {
  const chain = {} as QueryChain<T>;
  chain.populate = jest.fn<QueryChain<T>, [unknown?]>().mockReturnValue(chain);
  chain.lean = jest.fn<QueryChain<T>, []>().mockReturnValue(chain);
  chain.exec = jest.fn<Promise<T>, []>().mockResolvedValue(result);
  return chain;
}

function objectId(hex: string): Types.ObjectId {
  return new Types.ObjectId(hex);
}

describe('ScheduleValidationService', () => {
  const ids = {
    assignment: '6622b2a00f3a22d5b625e401',
    conflictEntry: '6622b2a00f3a22d5b625e602',
    course: '6622b2a00f3a22d5b625e301',
    group: '6622b2a00f3a22d5b625e201',
    classroom: '6622b2a00f3a22d5b625e501',
    teacher: '6622b2a00f3a22d5b625e111',
  };

  const assignment = {
    _id: objectId(ids.assignment),
    course: objectId(ids.course),
    group: objectId(ids.group),
    teacher: objectId(ids.teacher),
  };

  let scheduleEntryModel: { find: jest.Mock };
  let courseAssignmentModel: { findById: jest.Mock };
  let classroomModel: { exists: jest.Mock };
  let service: ScheduleValidationService;

  beforeEach(() => {
    scheduleEntryModel = {
      find: jest.fn(),
    };
    courseAssignmentModel = {
      findById: jest.fn(),
    };
    classroomModel = {
      exists: jest.fn(),
    };
    service = new ScheduleValidationService(
      scheduleEntryModel as never,
      courseAssignmentModel as never,
      classroomModel as never,
      new ScheduleMapper(),
    );
  });

  it('normalizes payload and rejects invalid time ranges early', async () => {
    await expect(
      service.normalizePayload({
        courseAssignmentId: ids.assignment,
        classroomId: ids.classroom,
        date: '2026-09-01',
        startTime: '10:05',
        endTime: '08:30',
        type: ScheduleEntryType.LECTURE,
        status: ScheduleEntryStatus.SCHEDULED,
      }),
    ).rejects.toThrow(BadRequestException);

    expect(courseAssignmentModel.findById).not.toHaveBeenCalled();
  });

  it('detects teacher, classroom and group conflicts in one pass', async () => {
    courseAssignmentModel.findById.mockReturnValue(query(assignment));
    classroomModel.exists.mockReturnValue(query({ _id: ids.classroom }));
    scheduleEntryModel.find.mockReturnValue(
      query([
        {
          _id: objectId(ids.conflictEntry),
          courseAssignment: assignment,
          classroom: objectId(ids.classroom),
          date: new Date('2026-09-01T00:00:00.000Z'),
          startTime: '08:45',
          endTime: '09:30',
          type: ScheduleEntryType.SEMINAR,
          status: ScheduleEntryStatus.SCHEDULED,
        },
      ]),
    );

    const payload = await service.normalizePayload({
      courseAssignmentId: ids.assignment,
      classroomId: ids.classroom,
      date: '2026-09-01',
      startTime: '08:30',
      endTime: '10:05',
      type: ScheduleEntryType.LECTURE,
      status: ScheduleEntryStatus.SCHEDULED,
    });

    await expect(service.assertNoConflicts(payload)).rejects.toThrow(
      ConflictException,
    );

    try {
      await service.assertNoConflicts(payload);
      throw new Error('Expected schedule conflict');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(ConflictException);
      const response = (error as ConflictException).getResponse();
      const conflicts =
        typeof response === 'object' && response !== null
          ? ((response as ConflictResponse).conflicts ?? [])
          : [];

      expect(conflicts.map((conflict) => conflict.type)).toEqual(
        expect.arrayContaining(['teacher', 'classroom', 'group']),
      );
    }
  });
});
