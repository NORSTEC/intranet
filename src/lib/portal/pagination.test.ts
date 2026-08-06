import { describe, expect, it } from "vitest";
import { resolvePagination } from "@/lib/portal/pagination";

describe("resolvePagination", () => {
  it("reports the first page of a full table", () => {
    const range = resolvePagination(351, 1, 25);
    expect(range).toMatchObject({
      page: 1,
      pageCount: 15,
      rangeEnd: 25,
      rangeStart: 1,
      sliceEnd: 25,
      sliceStart: 0,
    });
  });

  it("counts a partial last page as its own page", () => {
    const range = resolvePagination(351, 15, 25);
    expect(range.pageCount).toBe(15);
    expect(range.rangeStart).toBe(351);
    expect(range.rangeEnd).toBe(351);
  });

  // Filtering while standing on a later page is the ordinary case, and it is
  // the one that would otherwise render an empty table.
  it("clamps a page that no longer exists after filtering", () => {
    const range = resolvePagination(30, 12, 25);
    expect(range.page).toBe(2);
    expect(range.sliceStart).toBe(25);
    expect(range.rangeEnd).toBe(30);
  });

  it("keeps an empty result on a single page", () => {
    const range = resolvePagination(0, 4, 25);
    expect(range).toMatchObject({
      page: 1,
      pageCount: 1,
      rangeEnd: 0,
      rangeStart: 0,
    });
  });

  it("never resolves below the first page", () => {
    expect(resolvePagination(100, 0, 25).page).toBe(1);
    expect(resolvePagination(100, -3, 25).page).toBe(1);
  });

  it("hides paging when everything fits on one page", () => {
    expect(resolvePagination(25, 1, 25).pageCount).toBe(1);
    expect(resolvePagination(26, 1, 25).pageCount).toBe(2);
  });
});
