import type { StudyYearBucket } from "@/lib/statistics";

/** The tallest bar stops here, leaving room for its value label above —
 * a percentage of whatever height the row actually gets, so the plot fills
 * the card on desktop instead of sitting in a fixed, undersized box. */
const TALLEST = 88;

export function StudyYearColumns({ buckets }: { buckets: StudyYearBucket[] }) {
  if (buckets.length === 0) {
    return <p className="py-10 text-center text-sm opacity-60">No study years recorded yet.</p>;
  }

  const max = Math.max(...buckets.map((bucket) => bucket.count), 1);

  return (
    // min-h keeps the plot usable on mobile, where the card grows to its
    // content and there is no ancestor flex-1 to size against; md:flex-1
    // (set by the page) then lets it fill the square card's real height.
    <div className="flex h-full min-h-44 flex-col">
      {/* The border sits on this row, right at the bars' own baseline — a
          separate margin+border row would reopen a gap between them. */}
      <div className="flex flex-1 items-end gap-2 border-b border-moody/15 sm:gap-3">
        {buckets.map((bucket) => (
          <div
            key={bucket.label}
            className="group flex h-full min-w-0 flex-1 flex-col justify-end"
            title={`${bucket.label}: ${bucket.count}`}
          >
            <span className="mb-2 text-center text-sm font-medium tabular-nums opacity-70 transition-opacity group-hover:opacity-100">
              {bucket.count}
            </span>
            <div
              className="mx-auto w-full max-w-[3.25rem] rounded-t-lg bg-sun"
              style={{ height: `${(bucket.count / max) * TALLEST}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2 sm:gap-3">
        {buckets.map((bucket) => (
          <span
            key={bucket.label}
            className="min-w-0 flex-1 truncate text-center text-xs opacity-60"
          >
            {bucket.label}
          </span>
        ))}
      </div>
    </div>
  );
}
