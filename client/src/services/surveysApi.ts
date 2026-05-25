import api from './api';
import type {
  CreateSurveyInput,
  Survey,
  SurveyMyResponse,
  SurveyResults,
  SurveyStatus,
  SurveySubmitInput,
  SurveyTargetType,
} from '../types';

export type SurveyListFilters = {
  status?: SurveyStatus | '';
  targetType?: SurveyTargetType | '';
};

function buildSurveyParams(filters?: SurveyListFilters) {
  const params = new URLSearchParams();

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

  exportResultsCsv: async (id: string) => {
    const { data } = await api.get<Blob>(`/surveys/${id}/results/export`, {
      responseType: 'blob',
    });
    return data;
  },
};
