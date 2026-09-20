import { describe, expect, it } from 'vitest';
import { addDaysIso, groupByDate, rangeFor, shiftAnchor, startOfWeekIso, todayKyivIso } from './scheduleDates';

describe('scheduleDates', () => {
  it('finds monday of the week', () => {
    expect(startOfWeekIso('2026-09-10')).toBe('2026-09-07'); // Thursday → Monday
    expect(startOfWeekIso('2026-09-13')).toBe('2026-09-07'); // Sunday → Monday
  });
  it('builds week and day ranges', () => {
    expect(rangeFor('week', '2026-09-10')).toEqual({ from: '2026-09-07', to: '2026-09-13' });
    expect(rangeFor('day', '2026-09-10')).toEqual({ from: '2026-09-10', to: '2026-09-10' });
  });
  it('shifts by 7 days for week and 1 for day', () => {
    expect(shiftAnchor('week', '2026-09-10', 1)).toBe('2026-09-17');
    expect(shiftAnchor('day', '2026-09-10', -1)).toBe('2026-09-09');
    expect(addDaysIso('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('groups entries by date preserving order', () => {
    const grouped = groupByDate([{ date: '2026-09-08' }, { date: '2026-09-07' }, { date: '2026-09-08' }]);
    expect(grouped.map(([d, items]) => [d, items.length])).toEqual([['2026-09-07', 1], ['2026-09-08', 2]]);
  });
  it('formats Kyiv date', () => {
    expect(todayKyivIso(new Date('2026-09-07T22:30:00.000Z'))).toBe('2026-09-08');
  });
});
