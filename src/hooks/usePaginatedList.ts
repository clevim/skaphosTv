import { useState, useCallback, useRef } from 'react';

const PAGE_SIZE = 30;

export function usePaginatedList<T>(items: T[]) {
  const [page, setPage] = useState(1);
  const isLoadingMore = useRef(false);

  const visibleItems = items.slice(0, page * PAGE_SIZE);
  const hasMore = visibleItems.length < items.length;

  const loadMore = useCallback(() => {
    if (isLoadingMore.current || !hasMore) return;
    isLoadingMore.current = true;
    setTimeout(() => {
      setPage(p => p + 1);
      isLoadingMore.current = false;
    }, 300);
  }, [hasMore]);

  // Reset quando a lista muda
  const reset = useCallback(() => setPage(1), []);

  return { visibleItems, hasMore, loadMore, reset };
}