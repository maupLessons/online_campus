import api from './api';
import type { GradebookEntryStatus } from '../utils/gradebookStatus';

/** Дзеркало `ExternalDataMetaDto` (server/src/external-data-cache/external-data-meta.dto.ts); спільне для gradebook і finance. */
export interface ExternalDataMeta {
  profileId: string | null;
  fetchedAt: string | null;
  stale: boolean;
  reason?: 'no_active_profile' | 'no_current_term';
}

export interface GradebookEntry {
  subject: string;
  teacher?: string;
  controlType: string;
  score?: number;
  ects?: string;
  date?: string;
  status: GradebookEntryStatus;
}

export interface GradebookSemester {
  academicYear: string;
  semester: number;
  isCurrent: boolean;
  entries: GradebookEntry[];
}

export interface GradebookDto {
  semesters: GradebookSemester[];
  meta: ExternalDataMeta;
}

export const gradebookQueryKeys = {
  my: (profileId: string | null) => ['gradebook', 'my', profileId] as const,
};

export const gradebookApi = {
  async getMy(): Promise<GradebookDto> {
    const { data } = await api.get<GradebookDto>('/gradebook/my');
    return data;
  },
  async refresh(): Promise<GradebookDto> {
    const { data } = await api.post<GradebookDto>('/gradebook/my/refresh');
    return data;
  },
};
