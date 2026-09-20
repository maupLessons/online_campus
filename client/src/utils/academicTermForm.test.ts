import { describe, expect, it } from 'vitest';
import {
  buildCreateAcademicTermInput,
  derivedMaupDefaults,
  initialAcademicTermForm,
  sortAcademicTerms,
  validateAcademicTermForm,
  type AcademicTermFormState,
} from './academicTermForm';
import type { AcademicTerm } from '../types';

function form(
  overrides: Partial<AcademicTermFormState> = {},
): AcademicTermFormState {
  return {
    academicYear: '2026/2027',
    termNumber: '1',
    startsAt: '2026-09-01',
    endsAt: '2027-01-31',
    maupAcademicYear: '',
    maupSemester: '',
    ...overrides,
  };
}

function term(
  academicYear: string,
  termNumber: 1 | 2,
  status: AcademicTerm['status'] = 'planned',
): AcademicTerm {
  return {
    id: `${academicYear}-${termNumber}`,
    academicYear,
    termNumber,
    startsAt: '2026-09-01T00:00:00.000Z',
    endsAt: '2027-01-31T00:00:00.000Z',
    status,
    maupAcademicYear: Number(academicYear.slice(0, 4)),
    maupSemester: termNumber,
    activatedAt: null,
    closedAt: null,
  };
}

describe('initialAcademicTermForm', () => {
  it('proposes the academic year that starts in the given calendar year', () => {
    expect(initialAcademicTermForm(new Date('2026-05-10T00:00:00.000Z')))
      .toMatchObject({
        academicYear: '2026/2027',
        termNumber: '1',
        startsAt: '2026-09-01',
        endsAt: '2027-01-31',
      });
  });
});

describe('derivedMaupDefaults', () => {
  it('derives the MAUP parameters the server would derive itself', () => {
    expect(derivedMaupDefaults(form())).toEqual({
      maupAcademicYear: 2026,
      maupSemester: 1,
    });
    expect(derivedMaupDefaults(form({ termNumber: '2' }))).toEqual({
      maupAcademicYear: 2026,
      maupSemester: 2,
    });
  });
});

describe('validateAcademicTermForm', () => {
  it('accepts a valid form', () => {
    expect(validateAcademicTermForm(form())).toBeNull();
  });

  it('rejects a malformed academic year', () => {
    expect(validateAcademicTermForm(form({ academicYear: '2026-2027' }))).toBe(
      'academicTerms.validation.academicYearFormat',
    );
  });

  it('rejects non-consecutive years', () => {
    expect(validateAcademicTermForm(form({ academicYear: '2026/2028' }))).toBe(
      'academicTerms.validation.academicYearSequence',
    );
  });

  it('requires both dates', () => {
    expect(validateAcademicTermForm(form({ endsAt: '' }))).toBe(
      'academicTerms.validation.datesRequired',
    );
  });

  it('rejects endsAt <= startsAt', () => {
    expect(
      validateAcademicTermForm(
        form({ startsAt: '2027-01-31', endsAt: '2026-09-01' }),
      ),
    ).toBe('academicTerms.validation.dateRange');
    expect(
      validateAcademicTermForm(
        form({ startsAt: '2026-09-01', endsAt: '2026-09-01' }),
      ),
    ).toBe('academicTerms.validation.dateRange');
  });

  it('rejects malformed MAUP overrides', () => {
    expect(validateAcademicTermForm(form({ maupAcademicYear: '26' }))).toBe(
      'academicTerms.validation.maupAcademicYear',
    );
    expect(validateAcademicTermForm(form({ maupSemester: '3' }))).toBe(
      'academicTerms.validation.maupSemester',
    );
  });
});

describe('buildCreateAcademicTermInput', () => {
  it('fills the MAUP parameters from the academic year when not overridden', () => {
    expect(buildCreateAcademicTermInput(form())).toEqual({
      academicYear: '2026/2027',
      termNumber: 1,
      startsAt: '2026-09-01',
      endsAt: '2027-01-31',
      maupAcademicYear: 2026,
      maupSemester: 1,
    });
  });

  it('keeps an explicit override', () => {
    expect(
      buildCreateAcademicTermInput(
        form({ maupAcademicYear: '2025', maupSemester: '2' }),
      ),
    ).toMatchObject({ maupAcademicYear: 2025, maupSemester: 2 });
  });
});

describe('sortAcademicTerms', () => {
  it('puts the newest term first and does not mutate the input', () => {
    const input = [
      term('2025/2026', 1),
      term('2026/2027', 1),
      term('2025/2026', 2),
      term('2026/2027', 2, 'current'),
    ];
    const snapshot = [...input];

    expect(sortAcademicTerms(input).map((item) => item.id)).toEqual([
      '2026/2027-2',
      '2026/2027-1',
      '2025/2026-2',
      '2025/2026-1',
    ]);
    expect(input).toEqual(snapshot);
  });
});
