import { QueryClient } from '@tanstack/react-query';
import { isAuthError } from './api';

/**
 * TanStack Query client.
 * - 60-second refetch interval matches backend polling cycle.
 * - On 401, redirect to /login (auth expired mid-session).
 * - 3 retries with exponential backoff, but no retries for auth errors.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Auto-refetch every 60 seconds to stay in sync with backend polling
      refetchInterval: 60_000,
      // Also refetch when window regains focus
      refetchOnWindowFocus: true,
      // Keep stale data visible while refetching (don't blank out)
      staleTime: 30_000,
      // Retry 3 times, but never retry auth errors
      retry: (failureCount, error) => {
        if (isAuthError(error)) return false;
        return failureCount < 3;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30_000),
    },
    mutations: {
      // No auto-retry on mutations
      retry: false,
    },
  },
});
