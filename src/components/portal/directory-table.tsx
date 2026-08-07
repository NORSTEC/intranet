"use client";

import { useMemo, useState } from "react";
import type { TableSortDirection } from "@/components/portal/sortable-table-header";
import {
  DEFAULT_PAGE_SIZE,
  resolvePagination,
} from "@/lib/portal/pagination";

/**
 * The pieces every table in the portal shares. Sorting and searching started
 * here because the Google Workspace and Slack reports are the same report of
 * the same table for two providers, and the day one of them sorts differently
 * from the other is the day an administrator stops trusting that the two are
 * telling them the same kind of thing. Paging joined them for the same reason,
 * once one table grew past three hundred rows.
 */

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

/**
 * Three states rather than two: ascending, descending, and back to the order
 * the server sent. A table that can only be sorted has no way back to the
 * default once it has been touched.
 */
export function useTableSort<SortKey extends string>() {
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDirection, setSortDirection] =
    useState<TableSortDirection>("ascending");

  function changeSort(nextSortKey: SortKey) {
    if (nextSortKey === sortKey) {
      if (sortDirection === "descending") {
        setSortKey(null);
        setSortDirection("ascending");
        return;
      }
      setSortDirection((current) =>
        current === "ascending" ? "descending" : "ascending",
      );
      return;
    }
    setSortKey(nextSortKey);
    setSortDirection("ascending");
  }

  return { changeSort, sortDirection, sortKey };
}

export function sortRows<Row>(
  rows: Row[],
  sortKey: string | null,
  sortDirection: TableSortDirection,
  valueOf: (row: Row, key: string) => string,
) {
  if (!sortKey) return rows;
  return [...rows].sort((left, right) => {
    const comparison = valueOf(left, sortKey).localeCompare(
      valueOf(right, sortKey),
      "en",
      { sensitivity: "base" },
    );
    return sortDirection === "ascending" ? comparison : -comparison;
  });
}

/**
 * Paging is applied to the already-filtered, already-sorted rows, so a search
 * narrows the whole table rather than the page being looked at.
 *
 * This is a rendering budget, not a loading one: every row has already been
 * fetched and lives in memory either way. What it buys is a few dozen table
 * rows in the DOM instead of several hundred, which is what makes filtering and
 * sorting feel immediate. Fetching less would mean asking the database for a
 * range, and that is a different change — one that gives up client-side search
 * across the whole set.
 */
export function usePagination<Row>(
  rows: Row[],
  pageSize: number = DEFAULT_PAGE_SIZE,
) {
  const [requestedPage, setRequestedPage] = useState(1);

  const range = resolvePagination(rows.length, requestedPage, pageSize);

  const pageRows = useMemo(
    () => rows.slice(range.sliceStart, range.sliceEnd),
    [range.sliceEnd, range.sliceStart, rows],
  );

  return {
    page: range.page,
    pageCount: range.pageCount,
    pageRows,
    rangeEnd: range.rangeEnd,
    rangeStart: range.rangeStart,
    setPage: setRequestedPage,
    total: rows.length,
  };
}

function PageButton({
  disabled,
  icon,
  label,
  onClick,
}: {
  disabled: boolean;
  icon: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="portal-button"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <span aria-hidden="true" className="material-symbols-outlined text-[1.1rem]">
        {icon}
      </span>
    </button>
  );
}

/**
 * Hidden entirely while everything fits on one page. A control that can only be
 * pressed to no effect is noise on every small table in the portal, and most of
 * them are small.
 */
export function Pagination({
  label,
  page,
  pageCount,
  rangeEnd,
  rangeStart,
  setPage,
  total,
}: {
  /** Names the rows, e.g. "accounts" — read aloud as "Accounts pagination". */
  label: string;
  page: number;
  pageCount: number;
  rangeEnd: number;
  rangeStart: number;
  setPage: (page: number) => void;
  total: number;
}) {
  if (pageCount <= 1) return null;

  return (
    <nav
      aria-label={`${label} pagination`}
      className="mt-6 flex flex-wrap items-center justify-between gap-x-5 gap-y-3"
    >
      {/* Polite rather than assertive: the count changing is a confirmation of
          what was just pressed, not something to interrupt for. */}
      <p aria-live="polite" className="text-sm opacity-55">
        {rangeStart}–{rangeEnd} of {total}
      </p>
      <div className="flex items-center gap-2">
        <PageButton
          disabled={page === 1}
          icon="first_page"
          label="First page"
          onClick={() => setPage(1)}
        />
        <PageButton
          disabled={page === 1}
          icon="chevron_left"
          label="Previous page"
          onClick={() => setPage(page - 1)}
        />
        <span className="px-2 text-sm whitespace-nowrap opacity-55">
          Page {page} of {pageCount}
        </span>
        <PageButton
          disabled={page === pageCount}
          icon="chevron_right"
          label="Next page"
          onClick={() => setPage(page + 1)}
        />
        <PageButton
          disabled={page === pageCount}
          icon="last_page"
          label="Last page"
          onClick={() => setPage(pageCount)}
        />
      </div>
    </nav>
  );
}


export function CheckboxOption({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 py-2 text-sm font-medium">
      {/* The real checkbox is the focusable element but is visually hidden, so
          without this the box a sighted keyboard user is looking at never moves
          — they tab through a filter menu with no idea which option they are
          on. `peer` lets the drawn box answer for the input it stands in for. */}
      <input
        checked={checked}
        className="peer sr-only"
        onChange={onChange}
        type="checkbox"
      />
      <span
        aria-hidden="true"
        className={`flex size-5 shrink-0 items-center justify-center rounded-[0.35rem] border-2 border-moody peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-moody ${checked ? "bg-moody text-egg" : "bg-transparent text-transparent"}`}
      >
        <span className="material-symbols-outlined text-[0.9rem] font-bold">
          check
        </span>
      </span>
      <span>{label}</span>
    </label>
  );
}

export function FilterMenu({
  children,
  icon,
  label,
}: {
  children: React.ReactNode;
  icon: string;
  label: string;
}) {
  return (
    <details className="group relative">
      <summary className="portal-button list-none [&::-webkit-details-marker]:hidden">
        <span className="material-symbols-outlined text-[1.15rem]">{icon}</span>
        {label}
        <span className="material-symbols-outlined text-[1.05rem] transition-transform group-open:rotate-180">
          keyboard_arrow_down
        </span>
      </summary>
      <div className="portal-surface absolute left-0 top-[calc(100%+0.5rem)] z-30 min-w-60 p-4">
        {children}
      </div>
    </details>
  );
}

/** All / the single choice by name / a count / None, as everywhere else. */
export function multiSelectFilterLabel<Option extends string>(
  name: string,
  selected: Option[],
  total: number,
  labels: Record<Option, string>,
) {
  if (selected.length === total) return `${name}: All`;
  if (selected.length === 0) return `${name}: None`;
  if (selected.length === 1) return `${name}: ${labels[selected[0]]}`;
  return `${name}: ${selected.length} selected`;
}

export function toggleSelected<Option extends string>(
  selected: Option[],
  value: Option,
) {
  return selected.includes(value)
    ? selected.filter((candidate) => candidate !== value)
    : [...selected, value];
}

/**
 * A multi-select filter for one column, shaped like every other filter menu in
 * the portal: a checkbox per option, and a label that reads "Name: All" until
 * something is unchecked. Built once here rather than per table, so the Google
 * Workspace and Slack reports filter the columns they share — account type,
 * account status — in the same control instead of two that happen to look
 * alike.
 */
export function CheckboxFilterMenu<Option extends string>({
  icon,
  labels,
  legend,
  name,
  onChange,
  options,
  selected,
}: {
  icon: string;
  labels: Record<Option, string>;
  legend: string;
  name: string;
  onChange: (selected: Option[]) => void;
  options: readonly Option[];
  selected: Option[];
}) {
  return (
    <FilterMenu
      icon={icon}
      label={multiSelectFilterLabel(name, selected, options.length, labels)}
    >
      <fieldset>
        <legend className="section-label mb-2 opacity-45">{legend}</legend>
        {options.map((option) => (
          <CheckboxOption
            checked={selected.includes(option)}
            key={option}
            label={labels[option]}
            onChange={() => onChange(toggleSelected(selected, option))}
          />
        ))}
      </fieldset>
    </FilterMenu>
  );
}

export function SearchField({
  label,
  onChange,
  placeholder,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <label className="relative min-w-0 flex-1 xl:w-80 xl:flex-none">
      <span className="sr-only">{label}</span>
      <input
        className="portal-field w-full pr-10"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type="text"
        value={value}
      />
      <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 opacity-50">
        search
      </span>
    </label>
  );
}
