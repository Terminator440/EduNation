import { useState, useCallback, useMemo } from "react";

interface UsePaginationOptions {
  initialPage?: number;
  initialPageSize?: number;
}

interface UsePaginationResult<T> {
  page: number;
  pageSize: number;
  totalPages: number;
  totalItems: number;
  paginatedData: T[];
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  goToPage: (page: number) => void;
  nextPage: () => void;
  previousPage: () => void;
  setPageSize: (size: number) => void;
  setTotalItems: (total: number) => void;
}

/**
 * Hook pentru paginare client-side.
 * Folosit pentru liste cu date preîncărcate.
 */
export function usePagination<T>(
  data: T[],
  options: UsePaginationOptions = {}
): UsePaginationResult<T> {
  const { initialPage = 1, initialPageSize = 20 } = options;

  const [page, setPage] = useState(initialPage);
  const [pageSize, setPageSizeState] = useState(initialPageSize);

  const totalItems = data.length;
  const totalPages = Math.ceil(totalItems / pageSize);

  const paginatedData = useMemo(() => {
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    return data.slice(start, end);
  }, [data, page, pageSize]);

  const hasNextPage = page < totalPages;
  const hasPreviousPage = page > 1;

  const goToPage = useCallback(
    (newPage: number) => {
      if (newPage >= 1 && newPage <= totalPages) {
        setPage(newPage);
      }
    },
    [totalPages]
  );

  const nextPage = useCallback(() => {
    if (hasNextPage) {
      setPage((prev) => prev + 1);
    }
  }, [hasNextPage]);

  const previousPage = useCallback(() => {
    if (hasPreviousPage) {
      setPage((prev) => prev - 1);
    }
  }, [hasPreviousPage]);

  const setPageSize = useCallback((size: number) => {
    setPageSizeState(size);
    setPage(1); // Reset la prima pagină când schimbăm dimensiunea
  }, []);

  const setTotalItems = useCallback((_total: number) => {
    // Pentru server-side pagination, dar aici e client-side
  }, []);

  return {
    page,
    pageSize,
    totalPages,
    totalItems,
    paginatedData,
    hasNextPage,
    hasPreviousPage,
    goToPage,
    nextPage,
    previousPage,
    setPageSize,
    setTotalItems,
  };
}

/**
 * Hook pentru paginare server-side (Load More pattern).
 */
export function useLoadMore<T>(initialData: T[] = [], pageSize = 20) {
  const [data, setData] = useState<T[]>(initialData);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);

  const loadMore = useCallback(
    async (
      fetchFn: (offset: number, limit: number) => Promise<T[]>
    ): Promise<void> => {
      if (loading || !hasMore) return;

      setLoading(true);
      try {
        const newData = await fetchFn(offset, pageSize);
        if (newData.length < pageSize) {
          setHasMore(false);
        }
        setData((prev) => [...prev, ...newData]);
        setOffset((prev) => prev + newData.length);
      } finally {
        setLoading(false);
      }
    },
    [loading, hasMore, offset, pageSize]
  );

  const reset = useCallback(() => {
    setData([]);
    setOffset(0);
    setHasMore(true);
  }, []);

  return {
    data,
    setData,
    hasMore,
    loading,
    loadMore,
    reset,
  };
}
