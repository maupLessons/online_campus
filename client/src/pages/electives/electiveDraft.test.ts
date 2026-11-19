import { describe, expect, it } from 'vitest';
import {
  activeDraft,
  canSaveDraft,
  departmentTabs,
  disciplineLock,
  draftCredits,
  savedDisciplineIds,
  sameSet,
  toggleDraft,
} from './electiveDraft';
import {
  ElectiveDisciplineStatus,
  ElectiveSelectionStatus,
  type ActiveElectivePeriod,
  type ElectiveDiscipline,
  type ElectiveSelection,
} from '../../types';

function discipline(
  overrides: Partial<ElectiveDiscipline> & { id: string },
): ElectiveDiscipline {
  return {
    code: overrides.id,
    title: overrides.id,
    department: { id: 'd1', name: 'Кафедра' },
    term: { id: 't1', academicYear: '2026/2027', termNumber: 1 },
    credits: 3,
    capacity: 30,
    enrolledCount: 0,
    availableSeats: 10,
    status: ElectiveDisciplineStatus.ACTIVE,
    createdBy: 'u1',
    ...overrides,
  } as ElectiveDiscipline;
}

function selection(
  disciplineId: string,
  status: ElectiveSelectionStatus,
): ElectiveSelection {
  return {
    id: `s-${disciplineId}`,
    periodId: 'p1',
    discipline: discipline({ id: disciplineId }),
    status,
  } as ElectiveSelection;
}

describe('savedDisciplineIds', () => {
  it('returns selected and enrolled disciplines and ignores cancelled', () => {
    const item = {
      selections: [
        selection('a', ElectiveSelectionStatus.SELECTED),
        selection('b', ElectiveSelectionStatus.ENROLLED),
        selection('c', ElectiveSelectionStatus.CANCELLED),
      ],
    } as ActiveElectivePeriod;

    expect(savedDisciplineIds(item)).toEqual(['a', 'b']);
  });
});

describe('sameSet', () => {
  it('compares sets regardless of order', () => {
    expect(sameSet(['a', 'b'], ['b', 'a'])).toBe(true);
    expect(sameSet(['a', 'b'], ['a', 'c'])).toBe(false);
    expect(sameSet(['a'], ['a', 'b'])).toBe(false);
  });
});

describe('toggleDraft', () => {
  it('adds, removes and respects the limit', () => {
    expect(toggleDraft(['a', 'b'], 'c', 2)).toEqual(['a', 'b']);
    expect(toggleDraft(['a', 'b'], 'a', 2)).toEqual(['b']);
    expect(toggleDraft(['a'], 'c', 2)).toEqual(['a', 'c']);
  });
});

describe('canSaveDraft', () => {
  it('requires exactly N items and a change', () => {
    expect(canSaveDraft(['a', 'b'], ['b', 'a'], 2)).toBe(false);
    expect(canSaveDraft(['a', 'c'], ['a', 'b'], 2)).toBe(true);
    expect(canSaveDraft(['a'], [], 2)).toBe(false);
  });
});

describe('disciplineLock', () => {
  it('returns the reason a discipline cannot be ticked', () => {
    const open = discipline({ id: 'a' });
    const cancelled = discipline({
      id: 'x',
      status: ElectiveDisciplineStatus.CANCELLED,
    });
    const full = discipline({ id: 'f', availableSeats: 0 });

    expect(disciplineLock(open, ['a'], [], 2)).toBeNull();
    expect(disciplineLock(cancelled, [], [], 2)).toBe('cancelled');
    expect(disciplineLock(full, [], [], 2)).toBe('full');
    expect(disciplineLock(full, [], ['f'], 2)).toBeNull();
    expect(disciplineLock(open, ['b', 'c'], [], 2)).toBe('limit');
  });
});

describe('departmentTabs', () => {
  it('groups by department, sorts by name and counts ticked items', () => {
    const se = { id: 'se', name: 'Кафедра програмної інженерії' };
    const it_ = { id: 'it', name: 'Кафедра інформаційних технологій' };
    const tabs = departmentTabs(
      [
        discipline({ id: 'a', title: 'Б', department: se }),
        discipline({ id: 'b', title: 'А', department: it_ }),
        discipline({ id: 'c', title: 'А', department: se }),
      ],
      ['a', 'b'],
    );

    expect(tabs.map((tab) => tab.id)).toEqual(['it', 'se']);
    expect(tabs[1].disciplines.map((d) => d.id)).toEqual(['c', 'a']);
    expect(tabs.map((tab) => tab.selectedCount)).toEqual([1, 1]);
    expect(
      departmentTabs([discipline({ id: 'c', department: se })], ['a'])[0]
        .selectedCount,
    ).toBe(0);
  });
});

describe('draftCredits', () => {
  it('sums credits of ticked disciplines only', () => {
    expect(
      draftCredits(
        ['a', 'b'],
        [
          discipline({ id: 'a', credits: 3 }),
          discipline({ id: 'b', credits: 3 }),
          discipline({ id: 'c', credits: 5 }),
        ],
      ),
    ).toBe(6);
  });
});

describe('activeDraft', () => {
  it('drops ids of disciplines that are not active in the view', () => {
    const disciplines = [
      discipline({ id: 'a' }),
      discipline({ id: 'b', status: ElectiveDisciplineStatus.CANCELLED }),
      discipline({ id: 'c', status: ElectiveDisciplineStatus.ARCHIVED }),
    ];
    expect(activeDraft(['a', 'b', 'c', 'gone'], disciplines)).toEqual(['a']);
  });
});
