import { describe, expect, it } from 'vitest';
import type { GroupReference } from '../../types';
import {
  addSpecialty, groupsByCourse, isCourseFullySelected, listCourses,
  listSpecialties, selectAll, toggleCourse, toggleGroup,
} from './groupQuickSelect';

const cs = { id: 's-cs', name: "Комп'ютерні науки", code: '122' };
const se = { id: 's-se', name: 'Інженерія ПЗ', code: '121' };
const groups: GroupReference[] = [
  { id: 'g31', code: 'КН-31', course: 3, specialty: cs },
  { id: 'g11', code: 'КН-11', course: 1, specialty: cs },
  { id: 'p21', code: 'ПІ-21', course: 2, specialty: se },
  { id: 'p31', code: 'ПІ-31', course: 3, specialty: se },
  { id: 'x11', code: 'ХХ-11', course: 1 },
];

describe('groupQuickSelect', () => {
  it('lists courses and specialties', () => {
    expect(listCourses(groups)).toEqual([1, 2, 3]);
    expect(listSpecialties(groups)).toEqual([
      { id: 's-se', label: 'Інженерія ПЗ' },
      { id: 's-cs', label: "Комп'ютерні науки" },
    ]);
  });

  it('groups by course with groups sorted by code', () => {
    expect(groupsByCourse(groups).map((row) => [row.course, row.groups.map((g) => g.code)])).toEqual([
      [1, ['КН-11', 'ХХ-11']],
      [2, ['ПІ-21']],
      [3, ['КН-31', 'ПІ-31']],
    ]);
  });

  it('selects all groups', () => {
    expect(selectAll(groups).sort()).toEqual(['g11', 'g31', 'p21', 'p31', 'x11']);
  });

  it('toggles a course on and off, keeping other and unknown ids', () => {
    const on = toggleCourse(['old', 'p21'], groups, 3);
    expect(on).toEqual(['old', 'p21', 'g31', 'p31']);
    expect(isCourseFullySelected(on, groups, 3)).toBe(true);
    expect(toggleCourse(on, groups, 3)).toEqual(['old', 'p21']);
  });

  it('adds a specialty without duplicates', () => {
    const once = addSpecialty(['g31'], groups, 's-cs');
    expect(once).toEqual(['g31', 'g11']);
    expect(addSpecialty(once, groups, 's-cs')).toEqual(['g31', 'g11']);
  });

  it('toggles a single group', () => {
    expect(toggleGroup(['g11'], 'g31')).toEqual(['g11', 'g31']);
    expect(toggleGroup(['g11', 'g31'], 'g11')).toEqual(['g31']);
  });
});
