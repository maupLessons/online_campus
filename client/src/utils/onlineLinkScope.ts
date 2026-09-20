import type { OnlineLessonLink } from '../types';

export type LinkScope = 'pair' | 'date' | 'subject';

// Spec §4.2: priority is lesson > date > discipline. The modal's initial scope must match
// the picked-up link — otherwise "Save" creates a NEW record instead of editing the existing one,
// and "Delete" keeps hitting existingLink._id, i.e. a different target (review M2).
export function deriveInitialScope(
  link?: Pick<OnlineLessonLink, 'date' | 'startTime'>,
): LinkScope {
  if (!link) return 'pair';
  if (link.date && link.startTime) return 'pair';
  if (link.date) return 'date';
  return 'subject';
}
