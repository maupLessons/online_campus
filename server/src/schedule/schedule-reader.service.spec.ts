import { ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { Role } from '../common/types/roles.enum';
import { ScheduleEntryStatus, ScheduleEntryType } from './schedule.enums';
import { ScheduleMapper } from './schedule.mapper';
import { ScheduleReaderService } from './schedule-reader.service';

type QueryChain<T> = {
  populate: jest.Mock<QueryChain<T>, [unknown?]>;
  select: jest.Mock<QueryChain<T>, [unknown?]>;
  sort: jest.Mock<QueryChain<T>, [unknown?]>;
  lean: jest.Mock<QueryChain<T>, []>;
  exec: jest.Mock<Promise<T>, []>;
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

describe('ScheduleReaderService', () => {
  const ids = {
    assignment: '6622b2a00f3a22d5b625e401',
    foreignAssignment: '6622b2a00f3a22d5b625e402',
    schedule: '6622b2a00f3a22d5b625e601',
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
      name: 'Безпека',
      code: 'SEC101',
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

  let scheduleEntryModel: {
    find: jest.Mock;
    findById: jest.Mock;
    countDocuments: jest.Mock;
  };
  let courseAssignmentModel: { find: jest.Mock };
  let academicAccessService: {
    findVisibleCourseAssignmentIds: jest.Mock;
    canAccessCourseAssignment: jest.Mock;
  };
  let service: ScheduleReaderService;

  beforeEach(() => {
    scheduleEntryModel = {
      find: jest.fn(),
      findById: jest.fn(),
      countDocuments: jest.fn(),
    };
    courseAssignmentModel = {
      find: jest.fn(),
    };
    academicAccessService = {
      findVisibleCourseAssignmentIds: jest.fn(),
      canAccessCourseAssignment: jest.fn(),
    };
    service = new ScheduleReaderService(
      scheduleEntryModel as never,
      courseAssignmentModel as never,
      academicAccessService as never,
      new ScheduleMapper(),
    );
  });

  it('returns entries scoped to visible course assignments', async () => {
    academicAccessService.findVisibleCourseAssignmentIds.mockResolvedValue([
      objectId(ids.assignment),
    ]);
    scheduleEntryModel.find.mockReturnValue(query([scheduleEntry]));

    const result = await service.findForUser(
      { sub: ids.student, login: 'student', role: Role.STUDENT },
      {},
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: ids.schedule,
      courseAssignmentId: ids.assignment,
      courseCode: 'SEC101',
      groupCode: 'КН-11',
    });
    expect(scheduleEntryModel.find).toHaveBeenCalledWith(
      expect.objectContaining({
        courseAssignment: { $in: [objectId(ids.assignment)] },
      }),
    );
  });

  it('rejects explicit filters outside the user academic scope', async () => {
    academicAccessService.findVisibleCourseAssignmentIds.mockResolvedValue([
      objectId(ids.assignment),
    ]);
    courseAssignmentModel.find.mockReturnValue(
      query([{ _id: objectId(ids.foreignAssignment) }]),
    );

    await expect(
      service.findForUser(
        { sub: ids.student, login: 'student', role: Role.STUDENT },
        { groupId: ids.group },
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(scheduleEntryModel.find).not.toHaveBeenCalled();
  });
});
