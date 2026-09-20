import type { AcademicTerm, CreateAcademicTermInput } from '../types';

export type AcademicTermFormState = {
  academicYear: string;
  termNumber: '1' | '2';
  startsAt: string;
  endsAt: string;
  /** Empty string = "take the value derived from academicYear/termNumber". */
  maupAcademicYear: string;
  maupSemester: string;
};

/** The same regex as in `CreateAcademicTermDto.academicYear`. */
export const ACADEMIC_YEAR_PATTERN = /^\d{4}\/\d{4}$/;

export function initialAcademicTermForm(
  now: Date = new Date(),
): AcademicTermFormState {
  const year = now.getFullYear();

  return {
    academicYear: `${year}/${year + 1}`,
    termNumber: '1',
    startsAt: `${year}-09-01`,
    endsAt: `${year + 1}-01-31`,
    maupAcademicYear: '',
    maupSemester: '',
  };
}

/** The values the server would derive if the administrator overrode nothing. */
export function derivedMaupDefaults(
  form: Pick<AcademicTermFormState, 'academicYear' | 'termNumber'>,
): { maupAcademicYear: number; maupSemester: number } {
  return {
    maupAcademicYear: Number(form.academicYear.slice(0, 4)),
    maupSemester: Number(form.termNumber),
  };
}

/** Returns an i18n error key or null. Duplicates server-side checks to avoid a round trip for a 400. */
export function validateAcademicTermForm(
  form: AcademicTermFormState,
): string | null {
  if (!ACADEMIC_YEAR_PATTERN.test(form.academicYear)) {
    return 'academicTerms.validation.academicYearFormat';
  }

  const [first, second] = form.academicYear.split('/').map(Number);
  if (second !== first + 1) {
    return 'academicTerms.validation.academicYearSequence';
  }

  if (!form.startsAt || !form.endsAt) {
    return 'academicTerms.validation.datesRequired';
  }
  if (new Date(form.startsAt).getTime() >= new Date(form.endsAt).getTime()) {
    return 'academicTerms.validation.dateRange';
  }

  if (form.maupAcademicYear && !/^\d{4}$/.test(form.maupAcademicYear)) {
    return 'academicTerms.validation.maupAcademicYear';
  }
  if (form.maupSemester && !['1', '2'].includes(form.maupSemester)) {
    return 'academicTerms.validation.maupSemester';
  }

  return null;
}

export function buildCreateAcademicTermInput(
  form: AcademicTermFormState,
): CreateAcademicTermInput {
  const defaults = derivedMaupDefaults(form);

  return {
    academicYear: form.academicYear.trim(),
    termNumber: Number(form.termNumber) as 1 | 2,
    startsAt: form.startsAt,
    endsAt: form.endsAt,
    maupAcademicYear: form.maupAcademicYear
      ? Number(form.maupAcademicYear)
      : defaults.maupAcademicYear,
    maupSemester: form.maupSemester
      ? Number(form.maupSemester)
      : defaults.maupSemester,
  };
}

/** Same order as `GET /academic-terms`: academicYear desc, termNumber desc. */
export function sortAcademicTerms(terms: AcademicTerm[]): AcademicTerm[] {
  return [...terms].sort(
    (a, b) =>
      b.academicYear.localeCompare(a.academicYear) ||
      b.termNumber - a.termNumber,
  );
}
