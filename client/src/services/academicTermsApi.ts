import axios from 'axios';
import api from './api';
import type {
  AcademicTerm,
  CreateAcademicTermInput,
  UpdateAcademicTermInput,
} from '../types';

export const academicTermsApi = {
  /** `404 { code: 'no_current_term' }` is a normal state, not an error. */
  getCurrent: async (): Promise<AcademicTerm | null> => {
    try {
      const { data } = await api.get<AcademicTerm>('/academic-terms/current');
      return data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  },

  list: async (): Promise<AcademicTerm[]> => {
    const { data } = await api.get<AcademicTerm[]>('/academic-terms');
    return data;
  },

  create: async (input: CreateAcademicTermInput): Promise<AcademicTerm> => {
    const { data } = await api.post<AcademicTerm>('/academic-terms', input);
    return data;
  },

  update: async (
    id: string,
    input: UpdateAcademicTermInput,
  ): Promise<AcademicTerm> => {
    const { data } = await api.patch<AcademicTerm>(
      `/academic-terms/${id}`,
      input,
    );
    return data;
  },

  activate: async (id: string): Promise<AcademicTerm> => {
    const { data } = await api.post<AcademicTerm>(
      `/academic-terms/${id}/activate`,
    );
    return data;
  },

  remove: async (id: string): Promise<{ deleted: true }> => {
    const { data } = await api.delete<{ deleted: true }>(
      `/academic-terms/${id}`,
    );
    return data;
  },
};
