export type TableSortDirection = "ascending" | "descending";

export function SortableTableHeader({
  active,
  children,
  direction,
  onSort,
}: {
  active: boolean;
  children: React.ReactNode;
  direction: TableSortDirection;
  onSort: () => void;
}) {
  return (
    <th
      aria-sort={active ? direction : "none"}
      className="pb-3 pr-5 text-left font-semibold italic first:pl-4 last:pr-4"
      scope="col"
    >
      <button
        className="inline-flex cursor-pointer items-center gap-1.5 transition-colors hover:text-copper"
        onClick={onSort}
        type="button"
      >
        {children}
        <span
          className={`material-symbols-outlined text-[1rem] not-italic transition-transform ${
            active
              ? direction === "descending"
                ? "rotate-180 opacity-100"
                : "opacity-100"
              : "opacity-30"
          }`}
        >
          {active ? "arrow_upward" : "unfold_more"}
        </span>
      </button>
    </th>
  );
}
