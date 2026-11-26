"use client";

/** 迷你柱图，接受原始数值数组。 */
export function SparkBars({
  values,
  height = 56,
  labels,
  tone = "var(--nova-brand)",
}: {
  values: number[];
  height?: number;
  /** 右侧刻度文字，从上到下 */
  labels?: string[];
  tone?: string;
}) {
  const max = Math.max(...values, 1);
  const width = 240;
  const slot = width / values.length;
  const bw = slot * 0.52;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ width: "100%", height }}
      role="img"
      aria-label="柱状图"
    >
      {values.map((v, i) => {
        const h = Math.max((v / max) * (height - 3), v > 0 ? 2 : 1);
        return (
          <rect
            key={i}
            x={slot * i + (slot - bw) / 2}
            y={height - h}
            width={bw}
            height={h}
            rx={2}
            fill={tone}
            opacity={v === 0 ? 0.18 : 0.92}
          />
        );
      })}
      {labels?.map((l, i) => (
        <text
          key={l}
          x={width + 6}
          y={12 + i * 18}
          fontSize={10}
          fill="var(--nova-faint)"
        >
          {l}
        </text>
      ))}
    </svg>
  );
}
