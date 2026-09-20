import { PaginatedDto } from './paginated.dto';
import { PaginationDto } from './pagination.dto';

export type PaginatedEmptyReason = 'no_current_term' | 'no_active_profile';

export type PaginatedMeta = {
  // structurally matches AcademicTermRefDto; we don't pull in an import from courses here
  term?: { id: string; academicYear?: string; termNumber?: 1 | 2 } | null;
  reason?: PaginatedEmptyReason;
};

export type PaginatedWithMeta<T> = PaginatedDto<T> & { meta?: PaginatedMeta };

/**
 * An empty page. `reason` is optional: with it, the client sees `meta.reason`
 * (a configuration state), without it — a plain empty result with no `meta`.
 */
export function emptyPaginated<T>(
  pagination: PaginationDto,
  reason?: PaginatedEmptyReason,
): PaginatedWithMeta<T> {
  return {
    docs: [],
    totalDocs: 0,
    limit: pagination.limit || 10,
    page: pagination.page || 1,
    totalPages: 0,
    hasNextPage: false,
    hasPrevPage: false,
    ...(reason ? { meta: { reason } } : {}),
  };
}
