export const DEFAULT_PAGE_SIZE = 25;

export type PaginationRange = {
  page: number;
  pageCount: number;
  /** One-based and inclusive, for reading as "26–50 of 351". Zero when empty. */
  rangeEnd: number;
  rangeStart: number;
  /** Half-open, for `Array.prototype.slice`. */
  sliceEnd: number;
  sliceStart: number;
};

/**
 * Where a page starts and ends, given how many rows survived filtering.
 *
 * The requested page is clamped here rather than reset by an effect in the
 * hook. Narrowing a search from six pages to two while standing on page five is
 * the ordinary case, not an edge one, and an effect would render the empty
 * table once before correcting itself.
 *
 * An empty result is one page rather than zero, so "Page 1 of 1" is what a
 * reader sees instead of "Page 1 of 0".
 */
export function resolvePagination(
  total: number,
  requestedPage: number,
  pageSize: number = DEFAULT_PAGE_SIZE,
): PaginationRange {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, Math.trunc(requestedPage)), pageCount);
  const sliceStart = (page - 1) * pageSize;

  return {
    page,
    pageCount,
    rangeEnd: Math.min(page * pageSize, total),
    rangeStart: total === 0 ? 0 : sliceStart + 1,
    sliceEnd: page * pageSize,
    sliceStart,
  };
}
