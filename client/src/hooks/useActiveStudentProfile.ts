import { useAuthStore } from '../store/authStore';
import { pickActiveStudentProfile } from '../utils/activeStudentProfile';
import type { StudentProfile } from '../types';

/** The current user's active student profile; null for non-students. */
export function useActiveStudentProfile(): StudentProfile | null {
  return useAuthStore((state) => pickActiveStudentProfile(state.user));
}
