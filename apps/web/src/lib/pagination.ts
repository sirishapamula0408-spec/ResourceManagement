import { useState } from 'react';

export const PAGE_SIZES = [10, 25, 50, 100];

export interface Paged<T> {
  /** The rows on the current page. */
  items: T[];
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  /** Index of the first row on this page in the full list. */
  start: number;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
}

/**
 * Client-side pagination over an already filtered and sorted list.
 * `resetKey` should change whenever filters or sorting change; the view then returns to
 * page 1. If the list shrinks (for example after a delete), the page is clamped to the last one.
 */
export function usePagination<T>(items: T[], initialSize: number, resetKey: string): Paged<T> {
  const [pageSize, setSize] = useState(initialSize);
  const [page, setPage] = useState(1);
  const [lastKey, setLastKey] = useState(resetKey);
  // Adjust state while rendering when the key changes (React's recommended pattern).
  if (lastKey !== resetKey) {
    setLastKey(resetKey);
    setPage(1);
  }

  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(page, pageCount);
  const start = (current - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page: current,
    pageCount,
    pageSize,
    total: items.length,
    start,
    setPage,
    setPageSize: (size) => {
      setSize(size);
      setPage(1);
    },
  };
}

/** Page numbers to show: always the first and last, the current one and its neighbours. */
export function pageWindow(page: number, pageCount: number): (number | 'gap')[] {
  const pages = new Set([1, pageCount, page - 1, page, page + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b);
  const out: (number | 'gap')[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push('gap');
    out.push(p);
  });
  return out;
}
