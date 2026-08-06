"use client";

import { useState } from "react";
import type { TableSortDirection } from "@/components/portal/sortable-table-header";

/**
 * The pieces the Google Workspace and Slack reports both need. They are the
 * same report of the same table for two providers, and the day one of them
 * sorts or searches differently from the other is the day an administrator
 * stops trusting that the two are telling them the same kind of thing.
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
