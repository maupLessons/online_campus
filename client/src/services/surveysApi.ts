import api from './api';
import type {
  CreateSurveyInput,
  PaginatedResponse,
  ReferenceView,
  Survey,
  SurveyMyResponse,
  SurveyResults,
  SurveyStatus,
  SurveySubmitInput,
  SurveyTargetType,
} from '../types';

export type SurveyCourseTarget = {
  id: string;
  code: string;
  name: string;
};

export type SurveyListFilters = {
  search?: string;
  status?: SurveyStatus | '';
  targetType?: SurveyTargetType | '';
};

export type SurveyExportFormat = 'csv' | 'xlsx';

function buildSurveyParams(filters?: SurveyListFilters) {
  const params = new URLSearchParams();

  if (filters?.search?.trim()) {
    params.set('search', filters.search.trim());
  }

  if (filters?.status) {
    params.set('status', filters.status);
  }

  if (filters?.targetType) {
    params.set('targetType', filters.targetType);
  }

  return params;
}

export const surveysApi = {
  listActive: async () => {
    const { data } = await api.get<Survey[]>('/surveys/active');
    return data;
  },

  listManaged: async (filters?: SurveyListFilters) => {
    const params = buildSurveyParams(filters);
    const { data } = await api.get<Survey[]>('/surveys', {
      params,
    });
    return data;
  },

  getById: async (id: string) => {
    const { data } = await api.get<Survey>(`/surveys/${id}`);
    return data;
  },

  getMyResponse: async (id: string) => {
    const { data } = await api.get<SurveyMyResponse>(
      `/surveys/${id}/my-response`,
    );
    return data;
  },

  create: async (payload: CreateSurveyInput) => {
    const { data } = await api.post<Survey>('/surveys', payload);
    return data;
  },

  update: async (id: string, payload: CreateSurveyInput) => {
    const { data } = await api.put<Survey>(`/surveys/${id}`, payload);
    return data;
  },

  publish: async (id: string) => {
    const { data } = await api.patch<Survey>(`/surveys/${id}/publish`);
    return data;
  },

  close: async (id: string) => {
    const { data } = await api.patch<Survey>(`/surveys/${id}/close`);
    return data;
  },

  remove: async (id: string) => {
    const { data } = await api.delete<{ success: true }>(`/surveys/${id}`);
    return data;
  },

  submit: async (id: string, payload: SurveySubmitInput) => {
    const { data } = await api.post<{
      success: true;
      anonymous: boolean;
      submittedAt: string;
    }>(`/surveys/${id}/respond`, payload);
    return data;
  },

  getResults: async (id: string) => {
    const { data } = await api.get<SurveyResults>(`/surveys/${id}/results`);
    return data;
  },

  exportResults: async (id: string, format: SurveyExportFormat) => {
    const { data } = await api.get<ArrayBuffer>(
      `/surveys/${id}/results/export`,
      {
        params: { format },
        responseType: 'arraybuffer',
      },
    );
    const contentType =
      format === 'xlsx'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'text/csv;charset=utf-8';
    return new Blob([data], { type: contentType });
  },

  listTargetGroups: async () => {
    const { data } = await api.get<ReferenceView[]>('/references/groups');
    return data;
  },

  listTargetCourses: async () => {
    const { data } = await api.get<PaginatedResponse<SurveyCourseTarget>>(
      '/courses',
      { params: { page: 1, limit: 100 } },
    );
    return data.docs;
  },
};
