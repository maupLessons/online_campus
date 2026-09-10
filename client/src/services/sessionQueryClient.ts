import { QueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";

// A client belongs to one authentication generation, never to the whole SPA.
export function createSessionQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        retry: (failureCount, error) =>
          (error as AxiosError | undefined)?.response?.status !== 429 &&
          failureCount < 1,
      },
    },
  });
}
