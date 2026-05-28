import { create } from 'zustand';
import axios from 'axios';
import api from '../services/api';
import type { User } from '../types';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isAuthChecked: boolean;
  error: string | null;
  login: (login: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  loadProfile: () => Promise<void>;
  initializeAuth: () => Promise<void>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<string>;
}

function clearLegacyAuthStorage() {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  isAuthChecked: false,
  error: null,

  login: async (login: string, password: string) => {
    set({ isLoading: true, error: null });

    try {
      const { data } = await api.post('/auth/login', { login, password });

      clearLegacyAuthStorage();
      set({
        user: data.user,
        isAuthenticated: true,
        isLoading: false,
        isAuthChecked: true,
      });
    } catch (err: unknown) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;

      const message =
        status === 401
          ? 'Неправильний логін або пароль'
          : status === 403
            ? 'Обліковий запис заблоковано. Зверніться до адміністратора.'
            : 'Помилка входу. Спробуйте ще раз.';

      set({
        error: message,
        isLoading: false,
        isAuthChecked: true,
      });

      throw err;
    }
  },

  logout: async () => {
    try {
      await api.post('/auth/logout', {});
    } finally {
      clearLegacyAuthStorage();

      set({
        user: null,
        isAuthenticated: false,
        isAuthChecked: true,
        error: null,
      });
    }
  },

  loadProfile: async () => {
    const { data } = await api.get('/auth/profile');

    set({
      user: data,
      isAuthenticated: true,
      isAuthChecked: true,
    });
  },

  changePassword: async (oldPassword: string, newPassword: string) => {
    try {
      const { data } = await api.post('/auth/change-password', {
        oldPassword,
        newPassword,
      });

      return data.message || 'Пароль успішно змінено';
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const message = err.response?.data?.message;

        if (Array.isArray(message)) {
          throw new Error(message.join(', '));
        }

        if (typeof message === 'string') {
          throw new Error(message);
        }
      }

      throw new Error('Не вдалося змінити пароль');
    }
  },

  initializeAuth: async () => {
    try {
      const { data } = await api.get('/auth/profile');

      set({
        user: data,
        isAuthenticated: true,
        isAuthChecked: true,
      });
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        clearLegacyAuthStorage();

        set({
          user: null,
          isAuthenticated: false,
          isAuthChecked: true,
        });

        return;
      }

      set({
        user: null,
        isAuthenticated: false,
        isAuthChecked: true,
      });
    }
  },
}));
