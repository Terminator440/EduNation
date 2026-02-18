import { QueryClient } from "@tanstack/react-query";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";

const CACHE_KEY = "edunation-rq-cache";
const ONE_HOUR = 1000 * 60 * 60;
const ONE_DAY = ONE_HOUR * 24;
const SEVEN_DAYS = ONE_DAY * 7;

/** Query keys (first element of queryKey) that are persisted to localStorage for offline read-only */
const PERSISTED_PREFIXES = ["school-name", "school", "subjects-list", "profile-cache"];

function shouldDehydrateQuery(query: { state: { status: string }; queryKey: unknown[] }): boolean {
  if (query.state.status !== "success") return false;
  const key = Array.isArray(query.queryKey) ? String(query.queryKey[0]) : "";
  return PERSISTED_PREFIXES.some((prefix) => key === prefix || key.startsWith(prefix));
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        if (error instanceof Error) {
          const msg = error.message.toLowerCase();
          if (msg.includes("network") || msg.includes("fetch")) return failureCount < 2;
        }
        return false;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      staleTime: 1000 * 60 * 5,
      gcTime: ONE_DAY,
      refetchOnWindowFocus: false,
      // When offline, use cache only (no background refetch)
      networkMode: "offlineFirst",
    },
    mutations: {
      retry: false,
    },
  },
});

const storage = typeof window !== "undefined" ? window.localStorage : null;

export const persister = storage
  ? createSyncStoragePersister({
      storage,
      key: CACHE_KEY,
      throttleTime: 2000,
      serialize: (data) => JSON.stringify(data),
      deserialize: (str: string) => {
        try {
          return JSON.parse(str);
        } catch {
          return { clientState: { queries: [], mutations: [] } };
        }
      },
    })
  : undefined;

export const persistOptions = {
  persister: persister ?? ({
    persistClient: () => {},
    restoreClient: () => undefined,
    removeClient: () => {},
  }),
  maxAge: SEVEN_DAYS,
  buster: "",
  dehydrateOptions: {
    shouldDehydrateQuery,
  },
};

/** Stale/gc times for stable, rarely-changing data (school, subjects, profile cache) */
export const STABLE_CACHE_TIMES = {
  staleTime: ONE_DAY,
  gcTime: SEVEN_DAYS,
} as const;
