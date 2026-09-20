import type { TFunction } from 'i18next';
import type { AcademicTermRef } from '../types';

export function formatTerm(term: AcademicTermRef | null | undefined, t: TFunction): string {
  if (!term?.academicYear) return '—';
  return `${term.academicYear}, ${t('courses.termNumber', { n: term.termNumber })}`;
}
