import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';

const api = axios.create({
  baseURL: '/api',
});

type TokenResponse = {
  accessToken: string;
  refreshToken: string;
};

type RetriableRequestConfig = InternalAxiosRequestConfig & {
  _retry?: boolean;
};

const TOKEN_REFRESH_MARGIN_MS = 30_000;
const AUTH_ENDPOINTS = [
  '/auth/login',
  '/auth/refresh',
  '/auth/password-reset/request',
  '/auth/password-reset/confirm',
];
const AUTH_PAGES = ['/login', '/forgot-password', '/reset-password'];

let refreshPromise: Promise<TokenResponse> | null = null;

function getRequestPath(url?: string) {
  if (!url) {
    return '';
  }

  try {
    return new URL(url, window.location.origin).pathname.replace(/^\/api/, '');
  } catch {
    return url.split('?')[0].replace(/^\/api/, '');
  }
}

function isAuthEndpoint(url?: string) {
  const path = getRequestPath(url);
  return AUTH_ENDPOINTS.some((endpoint) => path === endpoint);
}

function getJwtExpiresAt(token: string) {
  const [, payload] = token.split('.');

  if (!payload) {
    return null;
  }

  try {
    const normalizedPayload = payload.replace(/-/g, '+').replace(/_/g, '/');
    const paddedPayload = normalizedPayload.padEnd(
      Math.ceil(normalizedPayload.length / 4) * 4,
      '=',
    );
    const decodedPayload = JSON.parse(window.atob(paddedPayload)) as {
      exp?: unknown;
    };

    return typeof decodedPayload.exp === 'number'
      ? decodedPayload.exp * 1000
      : null;
  } catch {
    return null;
  }
}

function isTokenExpiring(token: string) {
  const expiresAt = getJwtExpiresAt(token);
  return expiresAt !== null && expiresAt - Date.now() <= TOKEN_REFRESH_MARGIN_MS;
}

function persistTokens(tokens: TokenResponse) {
  localStorage.setItem('accessToken', tokens.accessToken);
  localStorage.setItem('refreshToken', tokens.refreshToken);
}

function clearTokensAndRedirect() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');

  if (!AUTH_PAGES.some((page) => window.location.pathname.startsWith(page))) {
    window.location.href = '/login';
  }
}

function setAuthorizationHeader(
  config: InternalAxiosRequestConfig,
  token: string,
) {
  config.headers.Authorization = `Bearer ${token}`;
}

async function refreshTokens() {
  const refreshToken = localStorage.getItem('refreshToken');

  if (!refreshToken) {
    throw new Error('Refresh token is missing');
  }

  if (!refreshPromise) {
    refreshPromise = axios
      .post<TokenResponse>('/api/auth/refresh', { refreshToken })
      .then(({ data }) => {
        persistTokens(data);
        return data;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

api.interceptors.request.use(async (config) => {
  let token = localStorage.getItem('accessToken');

  if (token && !isAuthEndpoint(config.url) && isTokenExpiring(token)) {
    try {
      token = (await refreshTokens()).accessToken;
    } catch (error) {
      clearTokensAndRedirect();
      return Promise.reject(error);
    }
  }

  if (token) {
    setAuthorizationHeader(config, token);
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
        const { accessToken } = await refreshTokens();
        setAuthorizationHeader(originalRequest, accessToken);
        return api(originalRequest);
      } catch {
        clearTokensAndRedirect();
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
    const submitRes = await api.post(`/courses/assignments/${assignmentId}/submit`, {
      fileIds: [fileId],
    });
    return submitRes.data;
  },
  
  deleteFile: async (fileId: string) => {
    return api.delete(`/files/${fileId}`);
  },
};
export default api;
