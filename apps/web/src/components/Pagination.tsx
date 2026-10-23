import { PAGE_SIZES, type Paged, pageWindow } from '../lib/pagination';

const navButton =
  'min-w-8 rounded-md border border-line bg-panel px-2 py-1 text-xs font-medium hover:bg-panel2 disabled:cursor-default disabled:opacity-50 disabled:hover:bg-panel';

/** "Showing 1–25 of 64 tasks", rows-per-page picker and page buttons, under a table. */
export function Pagination<T>({ paged, noun }: { paged: Paged<T>; noun: string }) {
  const { page, pageCount, pageSize, total, start, setPage, setPageSize } = paged;
  if (total === 0) return null;
  const end = Math.min(start + pageSize, total);

  return (
    <nav
      aria-label={`${noun} pages`}
      className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-3 py-2.5 text-xs text-muted"
    >
      <span className="tabular-nums">
        Showing {start + 1}–{end} of {total} {noun}
      </span>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5">
          Rows per page
          <select
            className="rounded-md border border-line bg-panel px-1.5 py-1 text-xs text-ink"
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        {pageCount > 1 && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              className={navButton}
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              ← Previous
            </button>
            {pageWindow(page, pageCount).map((p, i) =>
              p === 'gap' ? (
                <span key={`gap-${i}`} className="px-1">
                  …
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  className={`${navButton} tabular-nums ${p === page ? 'border-ink bg-ink text-panel hover:bg-ink' : ''}`}
                  aria-current={p === page ? 'page' : undefined}
                  aria-label={`Page ${p}`}
                  onClick={() => setPage(p)}
                >
                  {p}
                </button>
              ),
            )}
            <button
              type="button"
              className={navButton}
              disabled={page === pageCount}
              onClick={() => setPage(page + 1)}
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
