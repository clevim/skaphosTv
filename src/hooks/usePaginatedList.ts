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
    // Incrementa imediatamente (sem atraso perceptível ao rolar); a trava só evita
    // disparo duplo do onEndReached no mesmo quadro.
    setPage(p => p + 1);
    setTimeout(() => { isLoadingMore.current = false; }, 120);
  }, [hasMore]);

  // Reset quando a lista muda
  const reset = useCallback(() => setPage(1), []);

  return { visibleItems, hasMore, loadMore, reset };
}