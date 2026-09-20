import { MAUP_SCHEDULE_CONTRACT_FIXTURE } from '../integrations/maup-student-api/fixtures/maup-schedule.contract-fixture';
import { MaupWireArray } from '../integrations/maup-student-api/maup-student-api.types';
import {
  hashWireResponse,
  mapControlType,
  mapMaupScheduleToSnapshot,
} from './maup-schedule.mapper';
import { ScheduleControlType, ScheduleEntryType } from './schedule.enums';

describe('mapMaupScheduleToSnapshot', () => {
  it('expands recurring lessons into dated entries with stable keys', () => {
    const result = mapMaupScheduleToSnapshot(
      [MAUP_SCHEDULE_CONTRACT_FIXTURE[0]],
      { isExamSession: false },
    );

    expect(result.groupCode).toBe('КН-11');
    expect(result.periodFrom).toBe('2026-09-01');
    expect(result.periodTo).toBe('2026-09-30');
    const mondays = result.entries.filter((e) => e.subjectKey === '1001');
    expect(mondays.map((e) => e.date)).toEqual([
      '2026-09-07',
      '2026-09-14',
      '2026-09-21',
      '2026-09-28',
    ]);
    expect(mondays[0]).toMatchObject({
      startTime: '08:30',
      endTime: '10:00',
      type: ScheduleEntryType.LECTURE,
      teacherExternalId: '701',
      classroom: '101',
      classroomExternalId: '501',
      pairIdx: 1,
    });
    expect(mondays[0].key).toHaveLength(16);
    expect(mondays[0].controlType).toBeUndefined();

    const oddWeeks = result.entries.filter((e) => e.subjectKey === '1002');
    expect(oddWeeks.map((e) => e.date)).toEqual([
      '2026-09-02',
      '2026-09-16',
      '2026-09-30',
    ]);
    expect(oddWeeks[0].classroom).toBeUndefined();
  });

  it('maps exam session entries with control type', () => {
    const result = mapMaupScheduleToSnapshot(
      [MAUP_SCHEDULE_CONTRACT_FIXTURE[1]],
      { isExamSession: true },
    );
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      date: '2027-01-12',
      type: ScheduleEntryType.EXAM,
      controlType: ScheduleControlType.EXAM,
      subjectKey: '1003',
    });
  });

  it('maps control types from pair_kind text', () => {
    expect(mapControlType('Екзамен')).toBe(ScheduleControlType.EXAM);
    expect(mapControlType('Залік')).toBe(ScheduleControlType.CREDIT);
    expect(mapControlType('Курсова робота')).toBe(
      ScheduleControlType.COURSEWORK,
    );
    expect(mapControlType('Консультація')).toBe(ScheduleControlType.OTHER);
  });

  it('truncates untrusted strings and ignores malformed items', () => {
    const result = mapMaupScheduleToSnapshot(
      [
        {
          group: 'X-1',
          from_date: '2026-09-01',
          to_date: '2026-09-07',
          schedule: [
            { from_time: 'bad', to_time: '10:00', day_date: '2026-09-01' },
            {
              from_time: '9:00',
              to_time: '10:00',
              day_date: '2026-09-01',
              pair_subject: 'a'.repeat(400),
            },
          ],
        },
      ],
      { isExamSession: false },
    );
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].courseTitle).toHaveLength(300);
  });

  it('truncates external ids to the schema limit of 64 characters', () => {
    const result = mapMaupScheduleToSnapshot(
      [
        {
          group: 'X-1',
          from_date: '2026-09-01',
          to_date: '2026-09-07',
          schedule: [
            {
              from_time: '9:00',
              to_time: '10:00',
              day_date: '2026-09-01',
              subject_id: 'a'.repeat(100),
              prepod_id: 'b'.repeat(100),
              auditorium_id: 'c'.repeat(100),
            },
          ],
        },
      ],
      { isExamSession: false },
    );
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].subjectId).toHaveLength(64);
    expect(result.entries[0].teacherExternalId).toHaveLength(64);
    expect(result.entries[0].classroomExternalId).toHaveLength(64);
  });

  it('hashes the raw response deterministically', () => {
    expect(hashWireResponse(MAUP_SCHEDULE_CONTRACT_FIXTURE)).toBe(
      hashWireResponse(
        JSON.parse(
          JSON.stringify(MAUP_SCHEDULE_CONTRACT_FIXTURE),
        ) as MaupWireArray,
      ),
    );
  });

  // Acceptance criterion of spec §10.17.
  it('produces stable keys across runs and ignores classroom changes', () => {
    const first = mapMaupScheduleToSnapshot(
      [MAUP_SCHEDULE_CONTRACT_FIXTURE[0]],
      { isExamSession: false },
    );
    const again = mapMaupScheduleToSnapshot(
      JSON.parse(
        JSON.stringify([MAUP_SCHEDULE_CONTRACT_FIXTURE[0]]),
      ) as MaupWireArray,
      { isExamSession: false },
    );
    expect(again.entries.map((e) => e.key)).toEqual(
      first.entries.map((e) => e.key),
    );

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- deep clone for mutation, shape guaranteed by the fixture
    const period = JSON.parse(
      JSON.stringify(MAUP_SCHEDULE_CONTRACT_FIXTURE[0]),
    );
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    period.schedule[0].pair_auditorium = '999';
    expect(
      mapMaupScheduleToSnapshot([period], { isExamSession: false }).entries.map(
        (e) => e.key,
      ),
    ).toEqual(first.entries.map((e) => e.key));

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- deep clone for mutation, shape guaranteed by the fixture
    const moved = JSON.parse(JSON.stringify(MAUP_SCHEDULE_CONTRACT_FIXTURE[0]));
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    moved.schedule[0].from_time = '10:10';
    expect(
      mapMaupScheduleToSnapshot([moved], { isExamSession: false }).entries.map(
        (e) => e.key,
      ),
    ).not.toEqual(first.entries.map((e) => e.key));
  });
});
