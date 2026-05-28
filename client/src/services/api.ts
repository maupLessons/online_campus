import axios, {
  AxiosError,
  AxiosHeaders,
  type InternalAxiosRequestConfig,
} from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

type RetriableRequestConfig = InternalAxiosRequestConfig & {
  _retry?: boolean;
};

const AUTH_ENDPOINTS = [
  '/auth/login',
  '/auth/refresh',
  '/auth/logout',
  '/auth/password-reset/request',
  '/auth/password-reset/confirm',
];
const AUTH_PAGES = ['/login', '/forgot-password', '/reset-password'];
const LEGACY_TOKEN_KEYS = ['accessToken', 'refreshToken'];
const CSRF_COOKIE_NAME = 'campus_csrf_token';
const CSRF_HEADER_NAME = 'X-CSRF-Token';
const MUTATING_METHODS = new Set(['delete', 'patch', 'post', 'put']);

let refreshPromise: Promise<void> | null = null;

function clearLegacyAuthStorage() {
  if (typeof window === 'undefined') {
    return;
  }

  for (const key of LEGACY_TOKEN_KEYS) {
    localStorage.removeItem(key);
  }
}

clearLegacyAuthStorage();

function readCookie(name: string) {
  if (typeof document === 'undefined') {
    return null;
  }

  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const separatorIndex = cookie.indexOf('=');
    if (separatorIndex < 0) {
      continue;
    }

    const cookieName = cookie.slice(0, separatorIndex).trim();
    if (cookieName !== name) {
      continue;
    }

    const value = cookie.slice(separatorIndex + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  return null;
}

function getRequestPath(url?: string) {
  if (!url) {
    return '';
  }

  try {
    const origin =
      typeof window === 'undefined' ? 'http://localhost' : window.location.origin;

    return new URL(url, origin).pathname.replace(/^\/api/, '');
  } catch {
    return url.split('?')[0].replace(/^\/api/, '');
  }
}

function isAuthEndpoint(url?: string) {
  const path = getRequestPath(url);
  return AUTH_ENDPOINTS.some((endpoint) => path === endpoint);
}

function clearSessionAndRedirect() {
  clearLegacyAuthStorage();

  if (typeof window === 'undefined') {
    return;
  }

  if (!AUTH_PAGES.some((page) => window.location.pathname.startsWith(page))) {
    window.location.href = '/login';
  }
}

async function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = api
      .post('/auth/refresh', {})
      .then(() => undefined)
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

api.interceptors.request.use((config) => {
  config.withCredentials = true;

  if (MUTATING_METHODS.has(config.method?.toLowerCase() ?? '')) {
    const csrfToken = readCookie(CSRF_COOKIE_NAME);
    if (csrfToken) {
      config.headers = AxiosHeaders.from(config.headers);
      config.headers.set(CSRF_HEADER_NAME, csrfToken);
    }
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetriableRequestConfig | undefined;

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !isAuthEndpoint(originalRequest.url)
    ) {
      originalRequest._retry = true;

      try {
        await refreshSession();
        return api(originalRequest);
      } catch {
        clearSessionAndRedirect();
      }
    }

    return Promise.reject(error);
  },
);

export const filesApi = {
  uploadMaterial: async (caId: string, title: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const uploadRes = await api.post('/files/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    const fileId = uploadRes.data.fileId;
    const materialRes = await api.post(`/courses/${caId}/materials`, {
      title,
      fileIds: [fileId],
    });
    return materialRes.data;
  },

  submitAssignment: async (assignmentId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const uploadRes = await api.post('/files/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    const fileId = uploadRes.data.fileId;
    const submitRes = await api.post(
      `/courses/assignments/${assignmentId}/submit`,
      {
        fileIds: [fileId],
      },
    );
    return submitRes.data;
  },

  deleteFile: async (fileId: string) => {
    return api.delete(`/files/${fileId}`);
  },
};
export default api;
