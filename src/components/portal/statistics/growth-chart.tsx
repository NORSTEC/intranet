import type { MonthlyPoint } from "@/lib/statistics";

/**
 * An SVG scales its text along with its viewBox, so one geometry cannot serve
 * both widths: the desktop box would render mobile labels at ~6px. Two
 * geometries are rendered and CSS picks one.
 */
type Geometry = {
  width: number;
  height: number;
  padLeft: number;
  padRight: number;
  padTop: number;
  padBottom: number;
  labelSize: number;
  valueSize: number;
};

const DESKTOP: Geometry = {
  width: 860,
  height: 300,
  padLeft: 42,
  padRight: 16,
  padTop: 28,
  padBottom: 32,
  labelSize: 12,
  valueSize: 16,
};

const MOBILE: Geometry = {
  width: 360,
  height: 260,
  padLeft: 28,
  padRight: 10,
  padTop: 24,
  padBottom: 28,
  labelSize: 11,
  valueSize: 14,
};

/** Axis ticks on clean round numbers, four steps at most. */
function axisTicks(max: number): number[] {
  if (max <= 4) return [0, 1, 2, 3, 4].slice(0, Math.max(max, 1) + 1);
  const rawStep = max / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step =
    [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((value) => value >= rawStep) ??
    magnitude * 10;
  const ticks: number[] = [];
  for (let value = 0; value <= Math.ceil(max / step) * step + 1e-9; value += step) {
    ticks.push(Math.round(value));
  }
  return ticks;
}

function Plot({
  points,
  geometry,
  gradientId,
}: {
  points: MonthlyPoint[];
  geometry: Geometry;
  gradientId: string;
}) {
  const { width, height, padLeft, padRight, padTop, padBottom, labelSize, valueSize } = geometry;
  const ticks = axisTicks(Math.max(...points.map((point) => point.value)));
  const top = ticks[ticks.length - 1];
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;
  const baseline = padTop + plotHeight;
  const stepX = points.length > 1 ? plotWidth / (points.length - 1) : 0;

  const coords = points.map((point, index) => ({
    point,
    x: padLeft + index * stepX,
    y: baseline - (point.value / top) * plotHeight,
  }));

  const linePath = coords
    .map((coord, index) => `${index === 0 ? "M" : "L"}${coord.x.toFixed(1)} ${coord.y.toFixed(1)}`)
    .join(" ");
  const last = coords[coords.length - 1];
  const areaPath = `${linePath} L${last.x.toFixed(1)} ${baseline} L${coords[0].x.toFixed(1)} ${baseline} Z`;

  const labelIndexes = [...new Set([0, Math.floor((coords.length - 1) / 2), coords.length - 1])];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      role="img"
      aria-label={`Active members per month, from ${points[0].label} to ${last.point.label}`}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-copper)" stopOpacity={0.22} />
          <stop offset="100%" stopColor="var(--color-copper)" stopOpacity={0} />
        </linearGradient>
      </defs>

      {ticks.map((tick) => {
        const y = baseline - (tick / top) * plotHeight;
        return (
          <g key={tick}>
            <line
              x1={padLeft}
              y1={y}
              x2={width - padRight}
              y2={y}
              stroke="var(--color-moody)"
              strokeOpacity={tick === 0 ? 0.22 : 0.1}
              strokeWidth={1}
            />
            <text
              x={padLeft - 10}
              y={y + labelSize / 3}
              textAnchor="end"
              fontSize={labelSize}
              fill="var(--color-moody)"
              fillOpacity={0.6}
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {tick}
            </text>
          </g>
        );
      })}

      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path
        d={linePath}
        fill="none"
        stroke="var(--color-copper)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {coords.map((coord, index) => (
        <g key={`${coord.point.label}-${index}`} className="group">
          <circle
            cx={coord.x}
            cy={coord.y}
            r={4}
            fill="var(--color-copper)"
            stroke="var(--color-egg)"
            strokeWidth={2}
            className="opacity-0 transition-opacity group-hover:opacity-100"
          />
          <circle cx={coord.x} cy={coord.y} r={Math.max(stepX / 2, 9)} fill="transparent">
            <title>{`${coord.point.label}: ${coord.point.value} active`}</title>
          </circle>
        </g>
      ))}

      <circle
        cx={last.x}
        cy={last.y}
        r={4.5}
        fill="var(--color-copper)"
        stroke="var(--color-egg)"
        strokeWidth={2}
      />
      <text
        x={last.x}
        y={last.y - valueSize}
        textAnchor="end"
        fontSize={valueSize}
        fontWeight={600}
        fill="var(--color-moody)"
      >
        {last.point.value}
      </text>

      {labelIndexes.map((index) => (
        <text
          key={index}
          x={coords[index].x}
          y={height - 8}
          textAnchor={index === 0 ? "start" : index === coords.length - 1 ? "end" : "middle"}
          fontSize={labelSize}
          fill="var(--color-moody)"
          fillOpacity={0.6}
        >
          {coords[index].point.label}
        </text>
      ))}
    </svg>
  );
}

export function GrowthChart({ points }: { points: MonthlyPoint[] }) {
  if (points.length === 0) {
    return (
      <p className="py-12 text-center text-sm opacity-60">No membership history to chart yet.</p>
    );
  }

  return (
    <>
      <div className="sm:hidden">
        <Plot points={points} geometry={MOBILE} gradientId="growth-fill-mobile" />
      </div>
      <div className="hidden sm:block">
        <Plot points={points} geometry={DESKTOP} gradientId="growth-fill-desktop" />
      </div>
    </>
  );
}
