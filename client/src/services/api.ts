import axios, {
  AxiosError,
  AxiosHeaders,
  CanceledError,
  type AxiosAdapter,
  type InternalAxiosRequestConfig,
} from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

type RetriableRequestConfig = InternalAxiosRequestConfig & {
  _retry?: boolean;
  _sessionGeneration?: number;
  _sessionAdapter?: AxiosAdapter;
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
export const AUTH_SESSION_EXPIRED_EVENT = 'campus:auth-session-expired';

let refreshPromise: Promise<void> | null = null;
let sessionExpirationHandled = false;
let sessionGeneration = 0;
let cookieMutationQueue: Promise<void> = Promise.resolve();
const pendingProtectedRequests = new Set<AbortController>();

export function invalidateApiSession() {
  sessionGeneration += 1;
  refreshPromise = null;
  sessionExpirationHandled = false;
  for (const controller of pendingProtectedRequests) controller.abort();
  pendingProtectedRequests.clear();
}

function staleSession(config?: InternalAxiosRequestConfig) {
  return new CanceledError(
    'The request belongs to a previous session.',
    config,
  );
}

async function serializeCookieMutation<T>(
  operation: () => Promise<T>,
): Promise<T> {
  const previous = cookieMutationQueue;
  let release!: () => void;
  cookieMutationQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await operation();
  } finally {
    release();
  }
}

function clearLegacyAuthStorage() {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    for (const key of LEGACY_TOKEN_KEYS) localStorage.removeItem(key);
  } catch {
    // Restricted storage must not prevent session invalidation.
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
      typeof window === 'undefined'
        ? 'http://localhost'
        : window.location.origin;

    return new URL(url, origin).pathname.replace(/^\/api/, '');
  } catch {
    return url.split('?')[0].replace(/^\/api/, '');
  }
}

function isAuthEndpoint(url?: string) {
  const path = getRequestPath(url);
  return AUTH_ENDPOINTS.some((endpoint) => path === endpoint);
}

function isAuthPage() {
  return AUTH_PAGES.some((page) => window.location.pathname.startsWith(page));
}

function resetSessionExpirationHandling() {
  sessionExpirationHandled = false;
}

function expireSession() {
  clearLegacyAuthStorage();

  if (typeof window === 'undefined') {
    return;
  }

  if (sessionExpirationHandled) {
    return;
  }

  sessionExpirationHandled = true;
  window.dispatchEvent(new Event(AUTH_SESSION_EXPIRED_EVENT));

  if (!isAuthPage()) {
    window.location.replace('/login');
  }
}

async function refreshSession(generation: number) {
  if (generation !== sessionGeneration) throw staleSession();
  if (!refreshPromise) {
    const current = api
      .post('/auth/refresh', {})
      .then(() => undefined)
      .finally(() => {
        if (refreshPromise === current) refreshPromise = null;
      });
    refreshPromise = current;
  }

  return refreshPromise;
}

function attachCsrfToken(config: InternalAxiosRequestConfig) {
  if (MUTATING_METHODS.has(config.method?.toLowerCase() ?? '')) {
    const csrfToken = readCookie(CSRF_COOKIE_NAME);
    config.headers = AxiosHeaders.from(config.headers);
    if (csrfToken) {
      config.headers.set(CSRF_HEADER_NAME, csrfToken);
    } else {
      config.headers.delete(CSRF_HEADER_NAME);
    }
  }
}

api.interceptors.request.use(
  (request) => {
    const config = request as RetriableRequestConfig;
    config.withCredentials = true;
    config._sessionGeneration ??= sessionGeneration;
    const generation = config._sessionGeneration;
    const path = getRequestPath(config.url);
    const writesCookies = [
      '/auth/login',
      '/auth/logout',
      '/auth/refresh',
    ].includes(path);
    if (writesCookies || path === '/auth/profile') {
      config.timeout =
        config.timeout && config.timeout > 0
          ? Math.min(config.timeout, 20_000)
          : 20_000;
    }
    const protectedRequest = !isAuthEndpoint(config.url);
    const transport =
      config._sessionAdapter ??
      axios.getAdapter(config.adapter ?? api.defaults.adapter);
    config._sessionAdapter = transport;

    // Keep the underlying adapter on retries; wrapping a wrapper would enqueue
    // cookie writers recursively and could deadlock the FIFO queue.
    config.adapter = async (adapterConfig) => {
      const execute = async () => {
        // Login/logout preserve the user's FIFO intent even if their UI scope
        // changed while queued. Obsolete refreshes must never touch new cookies.
        if (
          generation !== sessionGeneration &&
          (!writesCookies || path === '/auth/refresh')
        ) {
          throw staleSession(adapterConfig);
        }
        attachCsrfToken(adapterConfig);
        const controller = protectedRequest ? new AbortController() : null;
        const callerSignal = adapterConfig.signal;
        const abort = () => controller?.abort();
        if (controller) {
          pendingProtectedRequests.add(controller);
          if (callerSignal?.aborted) controller.abort();
          else callerSignal?.addEventListener?.('abort', abort);
          adapterConfig.signal = controller.signal;
        }
        try {
          const response = await transport(adapterConfig);
          if (generation !== sessionGeneration)
            throw staleSession(adapterConfig);
          return response;
        } finally {
          if (controller) pendingProtectedRequests.delete(controller);
          callerSignal?.removeEventListener?.('abort', abort);
          adapterConfig.signal = callerSignal;
        }
      };
      return writesCookies ? serializeCookieMutation(execute) : execute();
    };
    return config;
  },
  undefined,
  { synchronous: true },
);

api.interceptors.response.use(
  (response) => {
    if (
      (response.config as RetriableRequestConfig)._sessionGeneration !==
      sessionGeneration
    ) {
      return Promise.reject(staleSession(response.config));
    }
    const path = getRequestPath(response.config.url);
    if (path === '/auth/login' || path === '/auth/refresh') {
      resetSessionExpirationHandling();
    }

    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as RetriableRequestConfig | undefined;
    const requestPath = getRequestPath(originalRequest?.url);

    if (
      originalRequest?._sessionGeneration !== undefined &&
      originalRequest._sessionGeneration !== sessionGeneration
    ) {
      return Promise.reject(staleSession(originalRequest));
    }
    if (axios.isCancel(error)) return Promise.reject(error);

    if (error.response?.status === 401 && requestPath === '/auth/refresh') {
      expireSession();
      return Promise.reject(error);
    }

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !isAuthEndpoint(originalRequest.url)
    ) {
      originalRequest._retry = true;
      const generation =
        originalRequest._sessionGeneration ?? sessionGeneration;

      try {
        await refreshSession(generation);
        if (generation !== sessionGeneration)
          throw staleSession(originalRequest);
        return api(originalRequest);
      } catch {
        if (generation !== sessionGeneration)
          return Promise.reject(staleSession(originalRequest));
        expireSession();
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
