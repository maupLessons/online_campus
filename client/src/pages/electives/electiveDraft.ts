import {
  ElectiveDisciplineStatus,
  ElectiveSelectionStatus,
  type ActiveElectivePeriod,
  type ElectiveDiscipline,
} from '../../types';

export type DisciplineLock = 'cancelled' | 'full' | 'limit' | null;

export type DepartmentTab = {
  id: string;
  name: string;
  disciplines: ElectiveDiscipline[];
  selectedCount: number;
};

export function savedDisciplineIds(item: ActiveElectivePeriod): string[] {
  return item.selections
    .filter(
      (selection) =>
        selection.status === ElectiveSelectionStatus.SELECTED ||
        selection.status === ElectiveSelectionStatus.ENROLLED,
    )
    .map((selection) => selection.discipline.id);
}

// Only disciplines that are active in the current view can be in the draft:
// a cancelled or archived one must not count towards the required set.
export function activeDraft(
  draft: readonly string[],
  disciplines: readonly ElectiveDiscipline[],
): string[] {
  const active = new Set(
    disciplines
      .filter((discipline) => discipline.status === ElectiveDisciplineStatus.ACTIVE)
      .map((discipline) => discipline.id),
  );
  return draft.filter((id) => active.has(id));
}

export function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

export function toggleDraft(
  draft: string[],
  disciplineId: string,
  requiredChoices: number,
): string[] {
  if (draft.includes(disciplineId)) {
    return draft.filter((id) => id !== disciplineId);
  }
  if (draft.length < requiredChoices) {
    return [...draft, disciplineId];
  }
  return draft;
}

export function canSaveDraft(
  draft: string[],
  saved: string[],
  requiredChoices: number,
): boolean {
  return draft.length === requiredChoices && !sameSet(draft, saved);
}

export function disciplineLock(
  discipline: ElectiveDiscipline,
  draft: string[],
  saved: string[],
  requiredChoices: number,
): DisciplineLock {
  if (draft.includes(discipline.id)) return null;
  if (discipline.status === ElectiveDisciplineStatus.CANCELLED) {
    return 'cancelled';
  }
  if (discipline.availableSeats <= 0 && !saved.includes(discipline.id)) {
    return 'full';
  }
  if (draft.length >= requiredChoices) return 'limit';
  return null;
}

export function departmentTabs(
  disciplines: ElectiveDiscipline[],
  draft: string[],
): DepartmentTab[] {
  const byDepartment = new Map<string, DepartmentTab>();

  for (const discipline of disciplines) {
    const { department } = discipline;
    let tab = byDepartment.get(department.id);
    if (!tab) {
      tab = {
        id: department.id,
        name: department.name ?? department.code ?? department.id,
        disciplines: [],
        selectedCount: 0,
      };
      byDepartment.set(department.id, tab);
    }
    tab.disciplines.push(discipline);
    if (draft.includes(discipline.id)) tab.selectedCount += 1;
  }

  const tabs = [...byDepartment.values()];
  for (const tab of tabs) {
    tab.disciplines.sort((a, b) => a.title.localeCompare(b.title, 'uk'));
  }
  return tabs.sort((a, b) => a.name.localeCompare(b.name, 'uk'));
}

export function draftCredits(
  draft: string[],
  disciplines: ElectiveDiscipline[],
): number {
  return disciplines
    .filter((discipline) => draft.includes(discipline.id))
    .reduce((sum, discipline) => sum + discipline.credits, 0);
}
