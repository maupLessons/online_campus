import { useEffect, type PropsWithChildren } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { useAuthStore } from "../store/authStore";
import { AUTH_SESSION_EXPIRED_EVENT } from "../services/api";

export default function SessionBoundary({ children }: PropsWithChildren) {
  const queryClient = useAuthStore((state) => state.queryClient);
  const sessionVersion = useAuthStore((state) => state.sessionVersion);
  const initializeAuth = useAuthStore((state) => state.initializeAuth);
  const expireSession = useAuthStore((state) => state.expireSession);

  useEffect(() => {
    void initializeAuth();
  }, [initializeAuth]);

  useEffect(() => {
    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, expireSession);
    return () => {
      window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, expireSession);
    };
  }, [expireSession]);

  // Remount observers and component-local data along with the isolated cache.
  // Bootstrap stays outside this keyed subtree, so rotation cannot re-run it.
  return (
    <QueryClientProvider key={sessionVersion} client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
