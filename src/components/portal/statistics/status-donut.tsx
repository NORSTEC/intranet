type Segment = {
  label: string;
  count: number;
  /** Fill for the ring band. */
  fill: string;
  /** Text colour for the percentage sitting inside that band. */
  onFill: string;
};

const SIZE = 240;
const CENTRE = SIZE / 2;
const RADIUS = 86;
const BAND = 34;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** Below this share the percentage will not fit inside the band. */
const INLINE_LABEL_FLOOR = 0.09;

export function StatusDonut({
  segments,
  total,
  centreLabel,
}: {
  segments: Segment[];
  total: number;
  centreLabel: string;
}) {
  type Arc = Segment & { fraction: number; start: number };
  const arcs = segments.reduce<Arc[]>((acc, segment) => {
    const start = acc.length > 0 ? acc[acc.length - 1].start + acc[acc.length - 1].fraction : 0;
    acc.push({ ...segment, fraction: total === 0 ? 0 : segment.count / total, start });
    return acc;
  }, []);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-7">
      <div className="relative w-full max-w-[17.5rem]">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full" role="img" aria-label={`${centreLabel}: ${arcs.map((arc) => `${arc.label} ${arc.count}`).join(", ")}`}>
          <circle
            cx={CENTRE}
            cy={CENTRE}
            r={RADIUS}
            fill="none"
            stroke="var(--color-moody)"
            strokeOpacity={0.08}
            strokeWidth={BAND}
          />
          <g transform={`rotate(-90 ${CENTRE} ${CENTRE})`}>
            {arcs.map((arc) => {
              const length = arc.fraction * CIRCUMFERENCE;
              return (
                <circle
                  key={arc.label}
                  cx={CENTRE}
                  cy={CENTRE}
                  r={RADIUS}
                  fill="none"
                  stroke={arc.fill}
                  strokeWidth={BAND}
                  strokeDasharray={`${length} ${CIRCUMFERENCE - length}`}
                  strokeDashoffset={-(arc.start * CIRCUMFERENCE)}
                />
              );
            })}
          </g>

          {arcs
            .filter((arc) => arc.fraction >= INLINE_LABEL_FLOOR)
            .map((arc) => {
              const angle = ((arc.start + arc.fraction / 2) * 360 - 90) * (Math.PI / 180);
              return (
                <text
                  key={arc.label}
                  x={CENTRE + RADIUS * Math.cos(angle)}
                  y={CENTRE + RADIUS * Math.sin(angle)}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={15}
                  fontWeight={600}
                  fill={arc.onFill}
                >
                  {Math.round(arc.fraction * 100)}%
                </text>
              );
            })}

          <text
            x={CENTRE}
            y={CENTRE - 6}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={44}
            fontWeight={300}
            fill="var(--color-moody)"
          >
            {total}
          </text>
          <text
            x={CENTRE}
            y={CENTRE + 24}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={11}
            fontWeight={600}
            letterSpacing="0.12em"
            fill="var(--color-moody)"
            fillOpacity={0.6}
          >
            {centreLabel.toUpperCase()}
          </text>
        </svg>
      </div>

      <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2">
        {arcs.map((arc) => (
          <li key={arc.label} className="flex items-center gap-2 text-sm">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: arc.fill }}
            />
            <span className="opacity-65">{arc.label}</span>
            <span className="font-medium tabular-nums">{arc.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
