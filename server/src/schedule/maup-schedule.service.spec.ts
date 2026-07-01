import { ServiceUnavailableException } from '@nestjs/common';
import { Types } from 'mongoose';
import { Role } from '../common/types/roles.enum';
import { MaupStudentApiError } from '../integrations/maup-student-api/maup-student-api.error';
import { MaupScheduleService } from './maup-schedule.service';

function query<T>(value: T) {
  return {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(value),
  };
}

describe('MaupScheduleService', () => {
  const userId = new Types.ObjectId().toHexString();

  it('stays inactive when the MAUP API integration is disabled', async () => {
    const service = new MaupScheduleService(
      { findOne: jest.fn() } as never,
      {
        getDiagnostics: jest.fn().mockReturnValue({ enabled: false }),
        getScheduleByStudentLookup: jest.fn(),
      } as never,
    );

    await expect(
      service.findMySchedule({
        sub: userId,
        login: 'student',
        role: Role.STUDENT,
      }),
    ).resolves.toBeNull();
  });

  it('loads and maps a student schedule from the MAUP API', async () => {
    const getScheduleByStudentLookup = jest.fn().mockResolvedValue([
      {
        student_id: 'maup-1',
        group: 'КН-11',
        from_date: '2026-09-01',
        to_date: '2026-09-30',
        schedule: [
          {
            day_date: '2026-09-10',
            from_time: '09:00',
            to_time: '10:20',
            pair_kind: 'Практичне заняття',
            pair_subject: 'Алгоритми',
            pair_prepod: 'Іваненко Іван',
          },
        ],
      },
    ]);
    const service = new MaupScheduleService(
      {
        findOne: jest.fn().mockReturnValue(
          query({
            studentProfile: {
              externalStudentId: 'maup-1',
              recordBookNumber: 'П-007264',
            },
          }),
        ),
      } as never,
      {
        getDiagnostics: jest.fn().mockReturnValue({ enabled: true }),
        getScheduleByStudentLookup,
      } as never,
    );

    const result = await service.findMySchedule(
      {
        sub: userId,
        login: 'student',
        role: Role.STUDENT,
      },
      { startDate: '2026-09-01', endDate: '2026-09-14' },
    );

    expect(getScheduleByStudentLookup).toHaveBeenCalledWith(
      {
        studentId: 'maup-1',
        recordBookNumber: 'П-007264',
      },
      { calendarYear: 2026 },
    );
    expect(result).toEqual([
      expect.objectContaining({
        date: '2026-09-10',
        courseName: 'Алгоритми',
      }),
    ]);
  });

  it('uses NSB fallback when external student_id is not linked yet', async () => {
    const getScheduleByStudentLookup = jest.fn().mockResolvedValue([]);
    const service = new MaupScheduleService(
      {
        findOne: jest.fn().mockReturnValue(
          query({
            studentProfile: {
              recordBookNumber: 'П-007264',
            },
          }),
        ),
      } as never,
      {
        getDiagnostics: jest.fn().mockReturnValue({ enabled: true }),
        getScheduleByStudentLookup,
      } as never,
    );

    await service.findMySchedule({
      sub: userId,
      login: 'student',
      role: Role.STUDENT,
    });

    expect(getScheduleByStudentLookup).toHaveBeenCalledWith(
      { recordBookNumber: 'П-007264' },
      {},
    );
  });

  it('converts upstream failures to a generic service unavailable response', async () => {
    const service = new MaupScheduleService(
      {
        findOne: jest.fn().mockReturnValue(
          query({
            studentProfile: {
              externalStudentId: 'maup-1',
            },
          }),
        ),
      } as never,
      {
        getDiagnostics: jest.fn().mockReturnValue({ enabled: true }),
        getScheduleByStudentLookup: jest.fn().mockRejectedValue(
          new MaupStudentApiError({
            kind: 'upstream',
            endpoint: 'schedule',
          }),
        ),
      } as never,
    );

    await expect(
      service.findMySchedule({
        sub: userId,
        login: 'student',
        role: Role.STUDENT,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
