import api from './api';
import type {
  AcademicTermRef, CourseAssignment, CourseAssignmentCard, CourseCatalogFilters, CourseCatalogItem,
  CreateCourseInput, PaginatedResponse, ResourceInput, UpdateCourseInput,
} from '../types';

// §5.1: meta is always present, but we read it as optional (rule 5 of plan 01 —
// the client checks meta?.reason, not whether meta is present)
export type CoursesEmptyReason = 'no_current_term' | 'no_active_profile';
export type PaginatedWithMeta<T> = PaginatedResponse<T> & {
  meta?: { term: AcademicTermRef | null; reason?: CoursesEmptyReason };
};

export const coursesQueryKeys = {
  my: () => ['courses', 'my'] as const,
  card: (id: string) => ['courses', 'card', id] as const,
  catalog: (filters: CourseCatalogFilters) => ['courses', 'catalog', filters] as const,
};

export const coursesApi = {
  listMy: async () => {
    const { data } = await api.get<PaginatedWithMeta<CourseAssignment>>('/courses/my', { params: { limit: 100 } });
    return data;
  },
  getCard: async (id: string) => {
    const { data } = await api.get<CourseAssignmentCard>(`/courses/course-assignments/${id}`);
    return data;
  },
  listCatalog: async (filters: CourseCatalogFilters) => {
    const { data } = await api.get<PaginatedResponse<CourseCatalogItem>>('/courses', { params: filters });
    return data;
  },
  createCourse: async (input: CreateCourseInput) => {
    const { data } = await api.post<CourseCatalogItem>('/courses', input);
    return data;
  },
  updateCourse: async (id: string, input: UpdateCourseInput) => {
    const { data } = await api.patch<CourseCatalogItem>(`/courses/${id}`, input);
    return data;
  },
  archiveCourse: async (id: string) => {
    const { data } = await api.post<CourseCatalogItem>(`/courses/${id}/archive`);
    return data;
  },
  restoreCourse: async (id: string) => {
    const { data } = await api.post<CourseCatalogItem>(`/courses/${id}/restore`);
    return data;
  },
  setMoodleUrl: async (id: string, body: { moodleUrl: string | null; reason?: string }) => {
    const { data } = await api.patch<CourseCatalogItem>(`/courses/${id}/moodle-url`, body);
    return data;
  },
  setResources: async (assignmentId: string, resources: ResourceInput[]) => {
    const { data } = await api.put<CourseAssignmentCard>(`/courses/course-assignments/${assignmentId}/resources`, { resources });
    return data;
  },
};
