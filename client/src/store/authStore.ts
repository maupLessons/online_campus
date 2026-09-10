import { create } from "zustand";
import axios from "axios";
import api, { invalidateApiSession } from "../services/api";
import type { User } from "../types";
import type { QueryClient } from "@tanstack/react-query";
import { createSessionQueryClient } from "../services/sessionQueryClient";

const PUBLIC_AUTH_PATHS = ["/login", "/forgot-password", "/reset-password"];
const CSRF_COOKIE_NAME = "campus_csrf_token";

interface AuthState {
  queryClient: QueryClient;
  sessionVersion: number;
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
  clearError: () => void;
  expireSession: () => void;
}

function clearLegacyAuthStorage() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
  } catch {
    // Restricted browser storage must not prevent session invalidation.
  }
}

function isPublicAuthPage() {
  if (typeof window === "undefined") {
    return false;
  }

  return PUBLIC_AUTH_PATHS.some((path) =>
    window.location.pathname.startsWith(path),
  );
}

function readCookie(name: string) {
  if (typeof document === "undefined") {
    return null;
  }

  const cookies = document.cookie.split(";");
  for (const cookie of cookies) {
    const separatorIndex = cookie.indexOf("=");
    if (separatorIndex < 0) {
      continue;
    }

    const cookieName = cookie.slice(0, separatorIndex).trim();
    if (cookieName === name) {
      return cookie.slice(separatorIndex + 1).trim();
    }
  }

  return null;
}

function hasSessionHint() {
  return Boolean(readCookie(CSRF_COOKIE_NAME));
}

export const useAuthStore = create<AuthState>((set, get) => {
  let authRevision = 0;
  let profileRevision = 0;

  const rotateCache = () => {
    invalidateApiSession();
    // clear() synchronously destroys queries, cancels their retryers and clears
    // mutations. Late callbacks retain the discarded client, not the next one.
    get().queryClient.clear();
    return {
      queryClient: createSessionQueryClient(),
      sessionVersion: get().sessionVersion + 1,
    };
  };

  const endSession = (isLoading = false) => {
    authRevision += 1;
    profileRevision += 1;
    clearLegacyAuthStorage();
    set({
      ...rotateCache(),
      user: null,
      isAuthenticated: false,
      isAuthChecked: true,
      isLoading,
      error: null,
    });
    return authRevision;
  };

  const acceptProfile = (user: User) => {
    authRevision += 1;
    profileRevision += 1;
    clearLegacyAuthStorage();
    set({
      ...rotateCache(),
      user,
      isAuthenticated: true,
      isAuthChecked: true,
      isLoading: false,
      error: null,
    });
  };

  return {
    queryClient: createSessionQueryClient(),
    sessionVersion: 0,
    user: null,
    isAuthenticated: false,
    isLoading: false,
    isAuthChecked: false,
    error: null,

    clearError: () => set({ error: null }),

    expireSession: () => {
      endSession();
    },

    login: async (login: string, password: string) => {
      const revision = endSession(true);

      try {
        const { data } = await api.post("/auth/login", { login, password });

        if (revision !== authRevision) return;
        acceptProfile(data.user);
      } catch (err: unknown) {
        if (revision !== authRevision) throw err;
        const status = axios.isAxiosError(err)
          ? err.response?.status
          : undefined;

        const message =
          status === 401
            ? "auth.login.invalidCredentials"
            : status === 403
              ? "auth.login.blocked"
              : "auth.login.failed";

        set({
          error: message,
          isLoading: false,
          isAuthChecked: true,
        });

        throw err;
      }
    },

    logout: async () => {
      const revision = endSession(true);

      try {
        await api.post("/auth/logout", {});
      } finally {
        if (revision === authRevision) set({ isLoading: false });
      }
    },

    loadProfile: async () => {
      // Explicit login/logout owns the session while cookies are changing.
      // Only initializeAuth may establish a session from an anonymous state.
      if (!get().isAuthenticated || get().isLoading) return;
      const revision = authRevision;
      const request = ++profileRevision;
      try {
        const { data } = await api.get<User>("/auth/profile");
        if (revision !== authRevision || request !== profileRevision) return;
        acceptProfile(data);
      } catch (err: unknown) {
        if (
          revision === authRevision &&
          request === profileRevision &&
          axios.isAxiosError(err) &&
          err.response?.status === 401
        )
          endSession();
        throw err;
      }
    },

    changePassword: async (oldPassword: string, newPassword: string) => {
      try {
        await api.post("/auth/change-password", {
          oldPassword,
          newPassword,
        });

        return "profile.changePasswordSuccess";
      } catch (err: unknown) {
        if (axios.isAxiosError(err)) {
          if (err.response?.status === 400) {
            throw new Error("profile.changePasswordInvalidOldPassword");
          }
        }

        throw new Error("profile.changePasswordError");
      }
    },

    initializeAuth: async () => {
      // React StrictMode and keyed page remounts must not bootstrap twice or race
      // an explicit login/logout that has already taken ownership of the session.
      if (get().isAuthChecked || get().isLoading) return;
      if (isPublicAuthPage() && !hasSessionHint()) {
        endSession();
        return;
      }

      const revision = authRevision;
      const request = ++profileRevision;
      set({ isLoading: true });
      try {
        const { data } = await api.get<User>("/auth/profile");
        if (revision !== authRevision || request !== profileRevision) return;
        acceptProfile(data);
      } catch {
        if (revision === authRevision && request === profileRevision)
          endSession();
      }
    },
  };
});
