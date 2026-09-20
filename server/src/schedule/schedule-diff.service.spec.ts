import { ScheduleDiffService } from './schedule-diff.service';
import { ScheduleEntryType } from './schedule.enums';

const entry = (over: Partial<Record<string, unknown>> = {}) =>
  ({
    key: 'k1',
    date: '2026-09-10',
    startTime: '08:30',
    endTime: '10:00',
    courseTitle: 'Алгоритми',
    subjectKey: '1002',
    type: ScheduleEntryType.LECTURE,
    classroom: '101',
    teacherName: 'Іваненко І. І.',
    ...over,
  }) as never;

describe('ScheduleDiffService', () => {
  const service = new ScheduleDiffService();
  const today = '2026-09-01';

  it('detects added, removed and changed entries', () => {
    const prev = [entry(), entry({ key: 'k2', date: '2026-09-11' })];
    const next = [
      entry({ classroom: '202' }),
      entry({ key: 'k3', date: '2026-09-12' }),
    ];
    const result = service.diff(prev, next, today);
    expect(result).toEqual([
      expect.objectContaining({
        kind: 'changed',
        changedFields: ['classroom'],
      }),
      expect.objectContaining({
        kind: 'removed',
        entry: expect.objectContaining({ key: 'k2' }) as unknown,
      }),
      expect.objectContaining({
        kind: 'added',
        entry: expect.objectContaining({ key: 'k3' }) as unknown,
      }),
    ]);
  });

  it('compares controlType for exam session entries', () => {
    const prev = [entry({ controlType: 'credit' })];
    const next = [entry({ controlType: 'exam' })];
    expect(service.diff(prev, next, today)).toEqual([
      expect.objectContaining({
        kind: 'changed',
        changedFields: ['controlType'],
      }),
    ]);
  });

  it('ignores entries before today', () => {
    const prev = [entry({ date: '2026-08-30' })];
    expect(service.diff(prev, [], today)).toEqual([]);
  });

  it('returns empty diff for identical snapshots', () => {
    expect(service.diff([entry()], [entry()], today)).toEqual([]);
  });
});
