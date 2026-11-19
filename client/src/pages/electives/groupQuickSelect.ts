import type { GroupReference } from '../../types';

const compare = (a: string, b: string) => a.localeCompare(b, 'uk');

const byCode = (a: GroupReference, b: GroupReference) => compare(a.code, b.code);

const withoutDuplicates = (ids: string[]) => Array.from(new Set(ids));

const addIds = (selected: string[], toAdd: GroupReference[]) =>
  withoutDuplicates([
    ...selected,
    ...[...toAdd].sort(byCode).map((group) => group.id),
  ]);

export function listCourses(groups: GroupReference[]): number[] {
  return Array.from(new Set(groups.map((group) => group.course))).sort(
    (a, b) => a - b,
  );
}

export function listSpecialties(
  groups: GroupReference[],
): Array<{ id: string; label: string }> {
  const byId = new Map<string, string>();
  for (const { specialty } of groups) {
    if (specialty && !byId.has(specialty.id)) {
      byId.set(specialty.id, specialty.name ?? specialty.code ?? specialty.id);
    }
  }
  return Array.from(byId, ([id, label]) => ({ id, label })).sort((a, b) =>
    compare(a.label, b.label),
  );
}

export function groupsByCourse(
  groups: GroupReference[],
): Array<{ course: number; groups: GroupReference[] }> {
  return listCourses(groups).map((course) => ({
    course,
    groups: groups.filter((group) => group.course === course).sort(byCode),
  }));
}

export function selectAll(groups: GroupReference[]): string[] {
  return withoutDuplicates(groups.map((group) => group.id));
}

export function isCourseFullySelected(
  selected: string[],
  groups: GroupReference[],
  course: number,
): boolean {
  const courseGroups = groups.filter((group) => group.course === course);
  return (
    courseGroups.length > 0 &&
    courseGroups.every((group) => selected.includes(group.id))
  );
}

export function toggleCourse(
  selected: string[],
  groups: GroupReference[],
  course: number,
): string[] {
  const courseGroups = groups.filter((group) => group.course === course);
  if (isCourseFullySelected(selected, groups, course)) {
    const remove = new Set(courseGroups.map((group) => group.id));
    return withoutDuplicates(selected.filter((id) => !remove.has(id)));
  }
  return addIds(selected, courseGroups);
}

export function addSpecialty(
  selected: string[],
  groups: GroupReference[],
  specialtyId: string,
): string[] {
  return addIds(
    selected,
    groups.filter((group) => group.specialty?.id === specialtyId),
  );
}

export function toggleGroup(selected: string[], groupId: string): string[] {
  return selected.includes(groupId)
    ? selected.filter((id) => id !== groupId)
    : [...selected, groupId];
}
