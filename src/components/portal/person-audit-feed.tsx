"use client";

import { useMemo, useState } from "react";
import type { PersonAuditEntry } from "@/lib/portal/person-audit";

function formatMoment(value: string) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function PersonAuditFeed({ entries }: { entries: PersonAuditEntry[] }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const visibleEntries = useMemo(() => {
    // The timestamps are ISO, so the date part compares correctly as text and
    // the range stays in the reader's calendar days rather than UTC instants.
    return entries.filter((entry) => {
      const day = entry.createdAt.slice(0, 10);
      if (from && day < from) return false;
      if (to && day > to) return false;
      return true;
    });
  }, [entries, from, to]);

  const isFiltered = Boolean(from || to);

  return (
    <section aria-labelledby="person-history-heading" className="mt-16">
      <h2 className="text-h2" id="person-history-heading">
        History
      </h2>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed opacity-55">
        Every recorded change to this person&apos;s access, roles, and
        memberships, newest first.
      </p>

      {entries.length > 0 && (
        <div className="mt-8 flex flex-wrap items-end gap-4">
          <label className="block">
            <span className="section-label mb-2 block opacity-45">From</span>
            <input
              className="portal-field w-auto"
              max={to || undefined}
              onChange={(event) => setFrom(event.target.value)}
              type="date"
              value={from}
            />
          </label>
          <label className="block">
            <span className="section-label mb-2 block opacity-45">To</span>
            <input
              className="portal-field w-auto"
              min={from || undefined}
              onChange={(event) => setTo(event.target.value)}
              type="date"
              value={to}
            />
          </label>
          {isFiltered && (
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
        </div>
      )}

      {visibleEntries.length > 0 ? (
        <div className="portal-surface mt-6 p-2 sm:p-3">
          <ol className="statistics-scroll max-h-[30rem] px-4 sm:px-5">
            {visibleEntries.map((entry) => {
              const context = [entry.organizationName, entry.detail]
                .filter(Boolean)
                .join(" · ");
              return (
                <li
                  className="grid gap-x-8 gap-y-1 border-b border-moody/15 py-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_13rem]"
                  key={entry.id}
                >
                  <div className="min-w-0">
                    <p className="font-medium">{entry.title}</p>
                    {context && (
                      <p className="mt-1 text-sm opacity-55">{context}</p>
                    )}
                  </div>
                  <div className="text-sm opacity-55 sm:text-right">
                    <time dateTime={entry.createdAt}>
                      {formatMoment(entry.createdAt)}
                    </time>
                    <span className="mt-0.5 block">
                      {entry.actorName ? `by ${entry.actorName}` : "Automatic"}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      ) : (
        <p className="mt-6 text-sm opacity-55">
          {isFiltered
            ? "Nothing was recorded in this period."
            : "Nothing has been recorded yet."}
        </p>
      )}
    </section>
  );
}
