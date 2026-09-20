import { Types } from 'mongoose';

/** Users with an active student profile in the group. */
export function activeStudentsInGroup(
  groupId: Types.ObjectId,
): Record<string, unknown> {
  return {
    studentProfiles: { $elemMatch: { group: groupId, status: 'active' } },
  };
}

export function activeStudentsInGroups(
  groupIds: Types.ObjectId[],
): Record<string, unknown> {
  return {
    studentProfiles: {
      $elemMatch: { group: { $in: groupIds }, status: 'active' },
    },
  };
}

export type LeanStudentProfile = {
  _id: Types.ObjectId;
  group?: unknown;
  status?: string;
};

/**
 * The active profile from a "raw" (lean) set of profiles: the one matching
 * `activeStudentProfileId`, or the first active one if there's no match.
 * Duplicates the selection logic of `UsersService.getActiveStudentProfile` for places that
 * can't inject `UsersService` without a circular module dependency.
 */
export function pickActiveLeanStudentProfile(
  studentProfiles: LeanStudentProfile[] | undefined,
  activeStudentProfileId: Types.ObjectId | string | null | undefined,
): LeanStudentProfile | null {
  const profiles = (studentProfiles ?? []).filter((p) => p.status === 'active');
  const activeId = activeStudentProfileId?.toString();
  return (
    profiles.find((p) => p._id.toString() === activeId) ?? profiles[0] ?? null
  );
}
