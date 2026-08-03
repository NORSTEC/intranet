function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

function monthBounds(year: number, month0: number): { start: string; end: string } {
  const start = `${year}-${pad2(month0 + 1)}-01`;
  const end = new Date(Date.UTC(year, month0 + 1, 0)).toISOString().slice(0, 10);
  return { start, end };
}

function monthLabel(year: number, month0: number): string {
  return new Date(Date.UTC(year, month0, 1)).toLocaleDateString("en-US", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}

export type MonthlyPoint = { label: string; value: number };

export type MembershipPeriod = {
  startsOn: string;
  endsOn: string | null;
  personId: number;
};

/**
 * One point per calendar month from the earliest period's start through the
 * current month, capped to the most recent `maxMonths`. A person counts as
 * active in a month if any of their periods overlaps it.
 */
export function buildGrowthSeries(periods: MembershipPeriod[], maxMonths = 24): MonthlyPoint[] {
  if (periods.length === 0) return [];

  const earliest = periods.reduce(
    (min, period) => (period.startsOn < min ? period.startsOn : min),
    periods[0].startsOn,
  );
  const [earliestYear, earliestMonth] = earliest.split("-").map(Number);
  const now = new Date();
  const nowYear = now.getUTCFullYear();
  const nowMonth = now.getUTCMonth();

  let startYear = earliestYear;
  let startMonth = earliestMonth - 1;

  const totalMonths = (nowYear - startYear) * 12 + (nowMonth - startMonth) + 1;
  if (totalMonths > maxMonths) {
    const startIndex = startYear * 12 + startMonth + (totalMonths - maxMonths);
    startYear = Math.floor(startIndex / 12);
    startMonth = startIndex % 12;
  }

  const points: MonthlyPoint[] = [];
  let year = startYear;
  let month = startMonth;
  while (year < nowYear || (year === nowYear && month <= nowMonth)) {
    const { start, end } = monthBounds(year, month);
    const active = new Set<number>();
    for (const period of periods) {
      if (period.startsOn <= end && (period.endsOn === null || period.endsOn >= start)) {
        active.add(period.personId);
      }
    }
    points.push({ label: monthLabel(year, month), value: active.size });
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  return points;
}

export type RankedItem = { label: string; count: number };

export function rankByCount<T>(
  items: T[],
  keyOf: (item: T) => string | null | undefined,
  fallbackLabel = "Unknown",
): RankedItem[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = keyOf(item) ?? fallbackLabel;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export type StudyYearBucket = { label: string; count: number; year: number };

/** Sorted by study year ascending (Year 1 → Year N), with Unknown last. */
export function bucketByStudyYear(people: { studyYear: number | null }[]): StudyYearBucket[] {
  const counts = new Map<number, number>();
  for (const person of people) {
    const key = person.studyYear ?? -1;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([year, count]) => ({
      year,
      count,
      label: year === -1 ? "Unknown" : `Year ${year}`,
    }))
    .sort((a, b) => a.year - b.year);
}

export function percentage(count: number, total: number): number {
  return total === 0 ? 0 : Math.round((count / total) * 1000) / 10;
}
