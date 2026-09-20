import { describe, expect, it } from 'vitest';
import {
  buildStudentProfilesPayload,
  emptyStudentProfileRow,
  studentProfileRowsFromUser,
  validateStudentProfileRows,
  type StudentProfileRow,
} from './studentProfileForm';
import type { StudentProfile } from '../types';

function row(overrides: Partial<StudentProfileRow> = {}): StudentProfileRow {
  return {
    externalStudentId: '1001',
    groupId: '65f000000000000000000001',
    recordBookNumber: 'КН-11/01',
    year: 2,
    ...overrides,
  };
}

function profile(overrides: Partial<StudentProfile> = {}): StudentProfile {
  return {
    id: 'p1',
    group: { id: '65f000000000000000000001', code: 'КН-11' },
    recordBookNumber: 'КН-11/01',
    year: 2,
    status: 'active',
    syncedAt: '2026-09-01T00:00:00.000Z',
    externalStudentId: '1001',
    ...overrides,
  };
}

describe('studentProfileRowsFromUser', () => {
  it('always yields at least one empty row', () => {
    expect(studentProfileRowsFromUser(null)).toEqual([
      emptyStudentProfileRow(),
    ]);
    expect(studentProfileRowsFromUser({ studentProfiles: [] })).toEqual([
      emptyStudentProfileRow(),
    ]);
  });

  it('maps active profiles into editable rows', () => {
    const rows = studentProfileRowsFromUser({
      studentProfiles: [
        profile(),
        profile({ id: 'p2', externalStudentId: '1002', status: 'inactive' }),
      ],
    });
    expect(rows).toEqual([row()]);
  });
});

describe('validateStudentProfileRows', () => {
  it('accepts a valid list', () => {
    expect(
      validateStudentProfileRows([row(), row({ externalStudentId: '1002' })]),
    ).toBeNull();
  });

  it('requires at least one profile', () => {
    expect(validateStudentProfileRows([])).toBe(
      'users.form.validation.profilesRequired',
    );
  });

  it('caps the list at five profiles', () => {
    const rows = Array.from({ length: 6 }, (_, index) =>
      row({ externalStudentId: `10${index}` }),
    );
    expect(validateStudentProfileRows(rows)).toBe(
      'users.form.validation.tooManyProfiles',
    );
  });

  it('requires every key field', () => {
    expect(validateStudentProfileRows([row({ externalStudentId: '  ' })])).toBe(
      'users.form.validation.profileFieldsRequired',
    );
    expect(validateStudentProfileRows([row({ groupId: '' })])).toBe(
      'users.form.validation.profileFieldsRequired',
    );
    expect(validateStudentProfileRows([row({ recordBookNumber: ' ' })])).toBe(
      'users.form.validation.profileFieldsRequired',
    );
  });

  it('rejects a year outside 1..6', () => {
    expect(validateStudentProfileRows([row({ year: 0 })])).toBe(
      'users.form.validation.profileYearRange',
    );
    expect(validateStudentProfileRows([row({ year: 7 })])).toBe(
      'users.form.validation.profileYearRange',
    );
  });

  it('rejects a duplicated external student id', () => {
    expect(validateStudentProfileRows([row(), row()])).toBe(
      'users.form.validation.duplicateExternalStudentId',
    );
  });
});

describe('buildStudentProfilesPayload', () => {
  it('trims text fields and keeps the server contract', () => {
    expect(
      buildStudentProfilesPayload([
        row({ externalStudentId: ' 1001 ', recordBookNumber: ' КН-11/01 ' }),
      ]),
    ).toEqual([
      {
        externalStudentId: '1001',
        groupId: '65f000000000000000000001',
        recordBookNumber: 'КН-11/01',
        year: 2,
      },
    ]);
  });
});
