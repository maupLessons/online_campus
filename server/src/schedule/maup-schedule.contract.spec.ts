import { MAUP_SCHEDULE_CONTRACT_FIXTURE } from '../integrations/maup-student-api/fixtures/maup-schedule.contract-fixture';
import { mapMaupScheduleResponse } from './maup-schedule.mapper';
import { ScheduleEntryStatus, ScheduleEntryType } from './schedule.enums';

describe('MAUP schedule contract fixture', () => {
  it('normalizes nested MAUP /schedule periods into internal schedule entries', () => {
    const result = mapMaupScheduleResponse(MAUP_SCHEDULE_CONTRACT_FIXTURE, {
      startDate: '2026-09-01',
      endDate: '2026-09-21',
    });

    expect(result).toHaveLength(5);
    expect(result.map((entry) => `${entry.date} ${entry.startTime}`)).toEqual([
      '2026-09-02 10:10',
      '2026-09-07 08:30',
      '2026-09-14 08:30',
      '2026-09-16 10:10',
      '2026-09-21 08:30',
    ]);
    expect(result[1]?.id).toMatch(/^maup:/);
    expect(result[1]).toMatchObject({
      courseAssignmentId: 'maup:1001',
      classroomId: 'maup:501',
      teacherId: 'maup:701',
      type: ScheduleEntryType.LECTURE,
      status: ScheduleEntryStatus.SCHEDULED,
      courseName: 'Основи програмування',
      courseCode: 'MAUP-1001',
      groupCode: 'КН-11',
      teacherName: 'Мельник Віктор Олегович',
      classroom: '101',
    });
    expect(result[0]).toMatchObject({
      courseAssignmentId: 'maup:1002',
      type: ScheduleEntryType.SEMINAR,
      classroom: 'Онлайн',
    });
  });

  it('keeps exact session dates from MAUP day_date records', () => {
    const result = mapMaupScheduleResponse(MAUP_SCHEDULE_CONTRACT_FIXTURE, {
      date: '2027-01-12',
    });

    expect(result).toEqual([
      expect.objectContaining({
        date: '2027-01-12',
        startTime: '11:20',
        endTime: '12:40',
        type: ScheduleEntryType.EXAM,
        courseName: 'Математика',
        classroom: '203',
      }),
    ]);
  });
});
