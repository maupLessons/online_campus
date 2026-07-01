import { mapMaupScheduleResponse } from './maup-schedule.mapper';
import { ScheduleEntryStatus, ScheduleEntryType } from './schedule.enums';

describe('mapMaupScheduleResponse', () => {
  it('expands recurring MAUP schedule items into concrete schedule entries', () => {
    const result = mapMaupScheduleResponse(
      [
        {
          student_id: 42,
          group: 'КН-11',
          from_date: '2026-09-01',
          to_date: '2026-09-30',
          schedule: [
            {
              pair_idx: 1,
              day_of_week_raw: 0,
              pair_weeks: 'Всі тижні',
              from_time: '8:30',
              to_time: '10:00',
              pair_kind: 'Лекція',
              pair_subject: 'Основи програмування',
              pair_auditorium: '101',
              pair_prepod: 'Мельник Віктор Олегович',
              subject_id: 1001,
              auditorium_id: 501,
              prepod_id: 701,
            },
          ],
        },
      ],
      { startDate: '2026-09-01', endDate: '2026-09-14' },
    );

    expect(result).toHaveLength(2);
    const firstEntry = result[0];
    expect(firstEntry).toBeDefined();
    expect(firstEntry?.id).toMatch(/^maup:/);
    expect(firstEntry).toMatchObject({
      courseAssignmentId: 'maup:1001',
      classroomId: 'maup:501',
      teacherId: 'maup:701',
      date: '2026-09-07',
      startTime: '08:30',
      endTime: '10:00',
      type: ScheduleEntryType.LECTURE,
      status: ScheduleEntryStatus.SCHEDULED,
      courseName: 'Основи програмування',
      courseCode: 'MAUP-1001',
      groupCode: 'КН-11',
      teacherName: 'Мельник Віктор Олегович',
      classroom: '101',
    });
    expect(result[1]?.date).toBe('2026-09-14');
  });

  it('uses exact day_date for exam/session schedule items', () => {
    const result = mapMaupScheduleResponse(
      [
        {
          student_id: 'student-1',
          from_date: '2026-01-01',
          to_date: '2026-01-31',
          schedule: [
            {
              day_date: '2026-01-12',
              from_time: '11:20',
              to_time: '12:40',
              pair_kind: 'Екзамен',
              pair_subject: 'Математика',
            },
          ],
        },
      ],
      { date: '2026-01-12' },
    );

    expect(result).toEqual([
      expect.objectContaining({
        date: '2026-01-12',
        type: ScheduleEntryType.EXAM,
        courseName: 'Математика',
      }),
    ]);
  });

  it('filters by status and drops malformed schedule items', () => {
    const result = mapMaupScheduleResponse(
      [
        {
          from_date: '2026-01-01',
          to_date: '2026-01-31',
          schedule: [
            {
              day_date: '2026-01-12',
              from_time: 'bad',
              to_time: '12:40',
              pair_subject: 'Некоректний запис',
            },
          ],
        },
      ],
      { status: ScheduleEntryStatus.CANCELLED },
    );

    expect(result).toEqual([]);
  });
});
