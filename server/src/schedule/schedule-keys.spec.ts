import {
  addDaysIso,
  buildEntryKey,
  normalizeSubjectKey,
  todayKyiv,
} from './schedule-keys';

describe('schedule-keys', () => {
  it('builds a stable key independent of teacher/classroom', () => {
    const base = {
      groupCode: 'КН-11',
      date: '2026-09-07',
      startTime: '08:30',
      subjectKey: '1001',
      pairIdx: 1,
    };
    expect(buildEntryKey(base)).toBe(buildEntryKey({ ...base }));
    expect(buildEntryKey(base)).not.toBe(
      buildEntryKey({ ...base, startTime: '10:10' }),
    );
    // Review Task 1 (deferred minor): pairIdx alone must also change the key —
    // without it, two lessons in the same group/day/time/subject would merge into one record.
    expect(buildEntryKey(base)).not.toBe(
      buildEntryKey({ ...base, pairIdx: 2 }),
    );
    // Spec §4.1.1: sha256(...).slice(0, 16) — 16 lowercase hex characters.
    expect(buildEntryKey(base)).toHaveLength(16);
    expect(buildEntryKey(base)).toMatch(/^[0-9a-f]{16}$/);
  });

  it('normalizes groupCode and subjectKey before hashing (spec §4.1.1)', () => {
    const base = {
      groupCode: 'КН-11',
      date: '2026-09-07',
      startTime: '08:30',
      subjectKey: 'Основи Програмування',
      pairIdx: 1,
    };
    expect(buildEntryKey(base)).toBe(
      buildEntryKey({
        ...base,
        groupCode: '  кн-11 ',
        subjectKey: 'основи програмування',
      }),
    );
    // Separator is \x1f, not '|': group 'a|b' + subject 'c' doesn't match 'a' + 'b|c'.
    expect(
      buildEntryKey({ ...base, groupCode: 'a|b', subjectKey: 'c' }),
    ).not.toBe(buildEntryKey({ ...base, groupCode: 'a', subjectKey: 'b|c' }));
  });

  it('prefers subjectId and falls back to normalized title', () => {
    expect(normalizeSubjectKey('1001', 'Основи програмування')).toBe('1001');
    expect(normalizeSubjectKey(undefined, '  Основи   Програмування ')).toBe(
      'основи програмування',
    );
  });

  it('computes Kyiv date and adds days', () => {
    expect(todayKyiv(new Date('2026-09-07T22:30:00.000Z'))).toBe('2026-09-08');
    expect(addDaysIso('2026-09-07', 7)).toBe('2026-09-14');
    expect(addDaysIso('2026-09-07', -1)).toBe('2026-09-06');
  });
});
