type RankedBarsProps = {
  items: { label: string; count: number }[];
  /** One hue for the whole list — bar length already encodes the value. */
  hue: string;
  emptyLabel?: string;
};

export function RankedBars({ items, hue, emptyLabel = "Nothing recorded yet." }: RankedBarsProps) {
  if (items.length === 0) {
    return <p className="py-10 text-center text-sm opacity-60">{emptyLabel}</p>;
  }

  const max = Math.max(...items.map((item) => item.count), 1);

  return (
    <ul className="statistics-scroll flex h-full flex-col gap-3.5 pr-1.5">
      {items.map((item) => (
        <li key={item.label} className="group shrink-0">
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-sm">{item.label}</span>
            <span className="shrink-0 text-sm font-medium tabular-nums opacity-60 transition-opacity group-hover:opacity-100">
              {item.count}
            </span>
          </div>
          <div className="mt-1.5 h-2 rounded-full bg-moody/10">
            <div
              className="h-full rounded-full"
              style={{ width: `${(item.count / max) * 100}%`, backgroundColor: hue }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
