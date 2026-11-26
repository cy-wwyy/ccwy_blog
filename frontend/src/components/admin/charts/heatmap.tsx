"use client";

import type { HourlyStat } from "@/lib/api";

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

/**
 * 星期 × 小时 访问热力。
 * 数据来自 /admin/stats/hourly，168 格，缺失为 0。
 */
export function HourlyHeatmap({ data }: { data: HourlyStat[] }) {
  const max = Math.max(...data.map((d) => d.views), 1);
  const cell = new Map(data.map((d) => [`${d.weekday}-${d.hour}`, d.views]));

  return (
    <div className="w-full">
      <div className="flex items-stretch gap-1.5">
        {/* 星期标签列 */}
        <div className="flex flex-col justify-between py-px text-[10px] leading-none text-[var(--nova-faint)]">
          {WEEKDAYS.map((d) => (
            <span key={d} className="h-[13px]">
              {d}
            </span>
          ))}
        </div>

        {/* 热力格 */}
        <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
          {WEEKDAYS.map((_, wd) => (
            <div key={wd} className="flex gap-[3px]">
              {Array.from({ length: 24 }, (_, h) => {
                const v = cell.get(`${wd}-${h}`) ?? 0;
                const t = v / max;
                return (
                  <span
                    key={h}
                    title={`周${WEEKDAYS[wd]} ${String(h).padStart(2, "0")}:00 · ${v} 次`}
                    className="h-[13px] flex-1 rounded-[2px] transition-colors"
                    style={{
                      backgroundColor:
                        v === 0
                          ? "var(--nova-sunken)"
                          : `color-mix(in oklab, var(--nova-brand) ${Math.round(
                              14 + t * 86
                            )}%, var(--nova-sunken))`,
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* 小时刻度 */}
      <div className="mt-1.5 flex justify-between pl-4 text-[10px] text-[var(--nova-faint)]">
        <span>00:00</span>
        <span>06:00</span>
        <span>12:00</span>
        <span>18:00</span>
        <span>23:00</span>
      </div>
    </div>
  );
}
