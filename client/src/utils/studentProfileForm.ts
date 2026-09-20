import type { StudentProfileInput, User } from '../types';

export type StudentProfileRow = {
  externalStudentId: string;
  groupId: string;
  recordBookNumber: string;
  year: number;
};

/** Matches `@ArrayMaxSize(5)` in `CreateUserDto.studentProfiles`. */
export const MAX_STUDENT_PROFILES = 5;

export function emptyStudentProfileRow(): StudentProfileRow {
  return { externalStudentId: '', groupId: '', recordBookNumber: '', year: 1 };
}

export function studentProfileRowsFromUser(
  user: Pick<User, 'studentProfiles'> | null | undefined,
): StudentProfileRow[] {
  const rows = (user?.studentProfiles ?? [])
    .filter((profile) => profile.status === 'active')
    .map((profile) => ({
      externalStudentId: profile.externalStudentId ?? '',
      groupId: profile.group?.id ?? '',
      recordBookNumber: profile.recordBookNumber ?? '',
      year: profile.year ?? 1,
    }));

  return rows.length > 0 ? rows : [emptyStudentProfileRow()];
}

/** Returns an i18n error key or null. */
export function validateStudentProfileRows(
  rows: StudentProfileRow[],
): string | null {
  if (rows.length === 0) {
    return 'users.form.validation.profilesRequired';
  }
  if (rows.length > MAX_STUDENT_PROFILES) {
    return 'users.form.validation.tooManyProfiles';
  }

  const seen = new Set<string>();

  for (const row of rows) {
    const externalStudentId = row.externalStudentId.trim();

    if (!externalStudentId || !row.groupId || !row.recordBookNumber.trim()) {
      return 'users.form.validation.profileFieldsRequired';
    }
    if (!Number.isInteger(row.year) || row.year < 1 || row.year > 6) {
      return 'users.form.validation.profileYearRange';
    }
    if (seen.has(externalStudentId)) {
      return 'users.form.validation.duplicateExternalStudentId';
    }

    seen.add(externalStudentId);
  }

  return null;
}

export function buildStudentProfilesPayload(
  rows: StudentProfileRow[],
): StudentProfileInput[] {
  return rows.map((row) => ({
    externalStudentId: row.externalStudentId.trim(),
    groupId: row.groupId,
    recordBookNumber: row.recordBookNumber.trim(),
    year: row.year,
  }));
}
