import type { StudentProfile, User } from '../types';

type ProfileOwner = Pick<User, 'studentProfiles' | 'activeStudentProfileId'>;

/**
 * The active student profile: explicitly chosen, otherwise the first with status `active`.
 * Mirrors the server-side `pickActiveStudentProfile` from `users/dto/user.dto.ts`.
 * Returns an array element, not a copy — the result is suitable as a store selector.
 */
export function pickActiveStudentProfile(
  user: ProfileOwner | null | undefined,
): StudentProfile | null {
  const active = (user?.studentProfiles ?? []).filter(
    (item) => item.status === 'active',
  );

  const selected = active.find(
    (item) => item.id === (user?.activeStudentProfileId ?? null),
  );

  return selected ?? active[0] ?? null;
}
