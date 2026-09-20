import { describe, expect, it } from 'vitest';
import { pickActiveStudentProfile } from './activeStudentProfile';
import type { StudentProfile } from '../types';

function profile(
  id: string,
  status: StudentProfile['status'] = 'active',
): StudentProfile {
  return {
    id,
    group: { id: `g-${id}`, code: `КН-${id}` },
    recordBookNumber: `RB-${id}`,
    year: 1,
    status,
    syncedAt: '2026-09-01T00:00:00.000Z',
  };
}

describe('pickActiveStudentProfile', () => {
  it('returns null for a user without profiles', () => {
    expect(pickActiveStudentProfile(null)).toBeNull();
    expect(pickActiveStudentProfile(undefined)).toBeNull();
    expect(
      pickActiveStudentProfile({
        studentProfiles: [],
        activeStudentProfileId: null,
      }),
    ).toBeNull();
  });

  it('returns the explicitly selected profile', () => {
    const profiles = [profile('1'), profile('2')];
    expect(
      pickActiveStudentProfile({
        studentProfiles: profiles,
        activeStudentProfileId: '2',
      })?.id,
    ).toBe('2');
  });

  it('falls back to the first active profile when the selected one is inactive', () => {
    const profiles = [profile('1', 'inactive'), profile('2'), profile('3')];
    expect(
      pickActiveStudentProfile({
        studentProfiles: profiles,
        activeStudentProfileId: '1',
      })?.id,
    ).toBe('2');
  });

  it('ignores inactive profiles entirely', () => {
    expect(
      pickActiveStudentProfile({
        studentProfiles: [profile('1', 'inactive')],
        activeStudentProfileId: '1',
      }),
    ).toBeNull();
  });

  it('returns a stable reference for the same state', () => {
    const state = {
      studentProfiles: [profile('1')],
      activeStudentProfileId: '1',
    };
    expect(pickActiveStudentProfile(state)).toBe(
      pickActiveStudentProfile(state),
    );
  });
});
