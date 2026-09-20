import { useQuery } from '@tanstack/react-query';
import { academicTermsApi } from '../services/academicTermsApi';
import type { AcademicTerm } from '../types';

export const CURRENT_TERM_QUERY_KEY = ['academic-terms', 'current'] as const;

export type CurrentTermState = {
  term: AcademicTerm | null;
  isLoading: boolean;
  isError: boolean;
};

/**
 * The current academic term. `term === null` and `isLoading === false`
 * means "no period configured" (the server returned 404 no_current_term).
 */
export function useCurrentTerm(): CurrentTermState {
  const { data, isPending, isError } = useQuery({
    queryKey: CURRENT_TERM_QUERY_KEY,
    queryFn: () => academicTermsApi.getCurrent(),
    staleTime: 5 * 60 * 1000,
  });

  return { term: data ?? null, isLoading: isPending, isError };
}
