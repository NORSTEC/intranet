"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { fetchAuditLogEntry } from "@/app/(portal)/admin/audit-log/actions";
import { AuditEventFacts } from "@/components/portal/audit-event-facts";
import {
  Pagination,
  usePagination,
} from "@/components/portal/directory-table";
import {
  CheckboxOption,
  FilterMenu,
} from "@/components/portal/members-directory";
import {
  SortableTableHeader,
  type TableSortDirection,
} from "@/components/portal/sortable-table-header";
import {
  auditCategoryLabels,
  type AuditCategory,
} from "@/lib/portal/audit-categories";
import type {
  AuditLogEntry,
  AuditLogEntryDetail,
} from "@/lib/portal/person-audit";

type SortKey = "time" | "category" | "activity" | "target" | "actor";

function formatMoment(value: string) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function sortValue(entry: AuditLogEntry, key: SortKey) {
  if (key === "time") return entry.createdAt;
  if (key === "category") return auditCategoryLabels[entry.category];
  if (key === "activity") return entry.title;
  if (key === "target") return entry.targetName ?? "";
  return entry.actorName ?? "";
}

/**
 * One event, opened from its row. The log is read by scanning and dipping
 * into single rows, so the detail arrives over the table rather than replacing
 * it — the same move Details makes in the access review.
 */
function AuditEventDialog({
  detail,
  loading,
  onClose,
  title,
}: {
  detail: AuditLogEntryDetail | null;
  loading: boolean;
  onClose: () => void;
  title: string;
}) {
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div
      aria-labelledby="audit-event-dialog-title"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(15,17,24,0.72)] p-5"
      role="dialog"
    >
      <div className="portal-surface max-h-[90vh] w-full max-w-2xl overflow-y-auto p-7 sm:p-8">
        <h2 className="text-2xl font-medium" id="audit-event-dialog-title">
          {title}
        </h2>

        {detail ? (
          <AuditEventFacts className="mt-7 text-sm" event={detail} />
        ) : (
          <p className="mt-7 text-sm opacity-55">
            {loading ? "Loading the event…" : "This event could not be loaded."}
          </p>
        )}

        <div className="mt-7">
          <button
            autoFocus
            className="portal-button"
            onClick={onClose}
            type="button"
          >
            <span
              aria-hidden="true"
              className="material-symbols-outlined text-[1.1rem]"
            >
              close
            </span>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export function AuditLogTable({
  entries,
  emptyMessage = "No events recorded yet.",
  showDateRangeFilter = true,
}: {
  entries: AuditLogEntry[];
  emptyMessage?: string;
  showDateRangeFilter?: boolean;
}) {
  const [openedEntry, setOpenedEntry] = useState<AuditLogEntry | null>(null);
  const [detail, setDetail] = useState<AuditLogEntryDetail | null>(null);
  const [loadingDetail, startLoadingDetail] = useTransition();
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDirection, setSortDirection] =
    useState<TableSortDirection>("ascending");

  const categoryOptions = useMemo(
    () =>
      [...new Set(entries.map((entry) => entry.category))].sort((left, right) =>
        auditCategoryLabels[left].localeCompare(auditCategoryLabels[right], "en"),
      ),
    [entries],
  );
  const [selectedCategories, setSelectedCategories] =
    useState<AuditCategory[]>(categoryOptions);

  const visibleEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("en");

    return entries
      .filter((entry) => {
        if (
          categoryOptions.includes(entry.category) &&
          !selectedCategories.includes(entry.category)
        ) {
          return false;
        }
        // Both people an event names are searchable, by either the name they
        // are listed under or the address they are known by.
        if (
          normalizedQuery &&
          ![
            entry.targetName,
            entry.targetEmail,
            entry.actorName,
            entry.actorEmail,
          ].some((field) =>
            field?.toLocaleLowerCase("en").includes(normalizedQuery),
          )
        ) {
          return false;
        }
        if (showDateRangeFilter) {
          // The timestamps are ISO, so the date part compares correctly as
          // text and the range stays in the reader's calendar days rather
          // than UTC instants.
          const day = entry.createdAt.slice(0, 10);
          if (from && day < from) return false;
          if (to && day > to) return false;
        }
        return true;
      })
      .sort((left, right) => {
        if (!sortKey) return 0;
        const comparison = sortValue(left, sortKey).localeCompare(
          sortValue(right, sortKey),
          "en",
          { sensitivity: "base" },
        );
        return sortDirection === "ascending" ? comparison : -comparison;
      });
  }, [
    entries,
    categoryOptions,
    selectedCategories,
    showDateRangeFilter,
    query,
    from,
    to,
    sortKey,
    sortDirection,
  ]);

  const entriesPage = usePagination(visibleEntries);

  function toggleCategory(category: AuditCategory) {
    setSelectedCategories((current) =>
      current.includes(category)
        ? current.filter((candidate) => candidate !== category)
        : [...current, category],
    );
  }

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

  function openEvent(entry: AuditLogEntry) {
    setOpenedEntry(entry);
    setDetail(null);
    startLoadingDetail(async () => {
      setDetail(await fetchAuditLogEntry(entry.id));
    });
  }

  function closeEvent() {
    setOpenedEntry(null);
    setDetail(null);
  }

  const categoryFilterLabel =
    selectedCategories.length === categoryOptions.length
      ? "Category: All"
      : selectedCategories.length === 1
        ? `Category: ${auditCategoryLabels[selectedCategories[0]]}`
        : selectedCategories.length === 0
          ? "Category: None"
          : `Category: ${selectedCategories.length} selected`;
  const isDateFiltered = Boolean(from || to);
  const dateFilterLabel = isDateFiltered ? "Date: custom range" : "Date: All time";

  return (
    <>
      {entries.length > 0 && (
        <div className="mt-8 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2">
            {showDateRangeFilter && (
              <FilterMenu icon="calendar_month" label={dateFilterLabel}>
                <fieldset className="grid gap-4">
                  <legend className="section-label mb-2 opacity-45">
                    Date range
                  </legend>
                  <label className="block">
                    <span className="section-label mb-2 block opacity-45">
                      From
                    </span>
                    <input
                      className="portal-field w-auto"
                      max={to || undefined}
                      onChange={(event) => setFrom(event.target.value)}
                      type="date"
                      value={from}
                    />
                  </label>
                  <label className="block">
                    <span className="section-label mb-2 block opacity-45">
                      To
                    </span>
                    <input
                      className="portal-field w-auto"
                      min={from || undefined}
                      onChange={(event) => setTo(event.target.value)}
                      type="date"
                      value={to}
                    />
                  </label>
                  {isDateFiltered && (
                    <button
                      className="portal-button"
                      onClick={() => {
                        setFrom("");
                        setTo("");
                      }}
                      type="button"
                    >
                      <span
                        aria-hidden="true"
                        className="material-symbols-outlined text-[1.1rem]"
                      >
                        filter_alt_off
                      </span>
                      Clear dates
                    </button>
                  )}
                </fieldset>
              </FilterMenu>
            )}

            <FilterMenu icon="filter_alt" label={categoryFilterLabel}>
              <fieldset>
                <legend className="section-label mb-2 opacity-45">
                  Category
                </legend>
                {categoryOptions.map((category) => (
                  <CheckboxOption
                    checked={selectedCategories.includes(category)}
                    key={category}
                    label={auditCategoryLabels[category]}
                    onChange={() => toggleCategory(category)}
                  />
                ))}
              </fieldset>
            </FilterMenu>
          </div>

          <label className="relative min-w-0 flex-1 xl:w-80 xl:flex-none">
            <span className="sr-only">Search events</span>
            <input
              className="portal-field w-full pr-10"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name or email"
              type="text"
              value={query}
            />
            <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 opacity-50">
              search
            </span>
          </label>
        </div>
      )}

      {visibleEntries.length > 0 ? (
        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-[54rem] border-collapse">
            <caption className="sr-only">
              Audit events with time, category, activity, affected account and
              who performed it
            </caption>
            <thead>
              <tr>
                {(
                  [
                    ["time", "Time"],
                    ["category", "Category"],
                    ["activity", "Activity"],
                    ["target", "Affected account"],
                    ["actor", "Performed by"],
                  ] as const
                ).map(([key, heading]) => (
                  <SortableTableHeader
                    active={sortKey === key}
                    direction={sortDirection}
                    key={key}
                    onSort={() => changeSort(key)}
                  >
                    {heading}
                  </SortableTableHeader>
                ))}
              </tr>
            </thead>
            <tbody>
              {entriesPage.pageRows.map((entry) => (
                <tr
                  aria-label={`View ${entry.title}`}
                  className="cursor-pointer border-b border-moody transition-colors hover:bg-moody hover:text-egg focus-visible:bg-moody focus-visible:text-egg focus-visible:outline-none"
                  key={entry.id}
                  onClick={() => openEvent(entry)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openEvent(entry);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <td className="whitespace-nowrap py-3 pl-4 pr-5">
                    <time dateTime={entry.createdAt}>
                      {formatMoment(entry.createdAt)}
                    </time>
                  </td>
                  <td className="py-3 pr-5">
                    {auditCategoryLabels[entry.category]}
                  </td>
                  <td className="py-3 pr-5">{entry.title}</td>
                  <td className="py-3 pr-5">
                    <span className="block">
                      {entry.targetName ?? "Deleted account"}
                    </span>
                    {entry.targetEmail && (
                      <span className="mt-0.5 block text-sm opacity-55">
                        {entry.targetEmail}
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    <span className="block">
                      {entry.actorName ?? "Automatic"}
                    </span>
                    {entry.actorEmail && (
                      <span className="mt-0.5 block text-sm opacity-55">
                        {entry.actorEmail}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-8 text-sm opacity-55">
          {entries.length === 0 ? emptyMessage : "No events match these filters."}
        </p>
      )}

      <Pagination {...entriesPage} label="Audit events" />

      {openedEntry && (
        <AuditEventDialog
          detail={detail}
          loading={loadingDetail}
          onClose={closeEvent}
          title={openedEntry.title}
        />
      )}
    </>
  );
}
