"use client";

/**
 * 阅读趋势：面积 + 折线 + 日均参考线。
 * 纯 SVG，无图表库依赖；数值全部来自 /admin/stats/daily。
 */
export function AreaTrend({
  data,
  height = 240,
  average,
  className,
}: {
  data: { label: string; value: number }[];
  height?: number;
  /** 真实日均值，画成虚线参考线（不是假的目标线） */
  average?: number;
  className?: string;
}) {
  const W = 760;
  const H = height;
  const padL = 4;
  const padR = 52;
  const padTop = 14;
  const padBottom = 22;

  const plotW = W - padL - padR;
  const plotH = H - padTop - padBottom;

  const values = data.map((d) => d.value);
  const max = Math.max(...values, average ?? 0, 1);
  const min = 0;
  const span = max - min || 1;

  const x = (i: number) => padL + (plotW / Math.max(data.length - 1, 1)) * i;
  const y = (v: number) => padTop + plotH - ((v - min) / span) * plotH;

  const line = data
    .map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`)
    .join(" ");
  const area = `${line} L${x(data.length - 1).toFixed(1)},${padTop + plotH} L${padL},${padTop + plotH} Z`;

  const ticks = Array.from({ length: 4 }, (_, i) => Math.round((max / 3) * i));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ width: "100%", height }}
      className={className}
      role="img"
      aria-label="阅读趋势"
    >
      <defs>
        <linearGradient id="nova-read-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--nova-brand)" stopOpacity="0.24" />
          <stop offset="100%" stopColor="var(--nova-brand)" stopOpacity="0.01" />
        </linearGradient>
      </defs>

      {ticks.map((t) => {
        const ty = y(t);
        return (
          <g key={t}>
            <line
              x1={padL}
              x2={W - padR}
              y1={ty}
              y2={ty}
              stroke="var(--nova-line)"
              strokeWidth={1}
            />
            <text
              x={W - padR + 8}
              y={ty + 4}
              fontSize={11}
              fill="var(--nova-faint)"
            >
              {t}
            </text>
          </g>
        );
      })}

      {typeof average === "number" && average > 0 && (
        <g>
          <line
            x1={padL}
            x2={W - padR}
            y1={y(average)}
            y2={y(average)}
            stroke="var(--nova-amber)"
            strokeWidth={1.2}
            strokeDasharray="5 4"
            opacity={0.8}
          />
          <g transform={`translate(${W - padR - 4}, ${y(average)})`}>
            <rect x={-70} y={-10} width={70} height={20} rx={6} fill="var(--nova-amber)" />
            <text x={-35} y={4} textAnchor="middle" fontSize={11} fontWeight={600} fill="#fff">
              日均 {average}
            </text>
          </g>
        </g>
      )}

      <path d={area} fill="url(#nova-read-area)" />
      <path
        d={line}
        fill="none"
        stroke="var(--nova-brand)"
        strokeWidth={2.4}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {data.length > 0 && (
        <circle
          cx={x(data.length - 1)}
          cy={y(data[data.length - 1].value)}
          r={4}
          fill="var(--nova-island)"
          stroke="var(--nova-brand)"
          strokeWidth={2.4}
        />
      )}

      {data.map((d, i) => {
        // 只标注首、中、尾三个日期，避免拥挤
        const show =
          i === 0 || i === data.length - 1 || i === Math.floor((data.length - 1) / 2);
        if (!show) return null;
        return (
          <text
            key={d.label}
            x={x(i)}
            y={H - 5}
            textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"}
            fontSize={11}
            fill="var(--nova-faint)"
          >
            {d.label}
          </text>
        );
      })}
    </svg>
  );
}
