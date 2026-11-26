"use client";

/** Nova 分段器（shadcn 的 tabs 是下划线式，这里需要药丸式） */
export function Segmented<T extends string>({
  items,
  value,
  onChange,
  size = "md",
}: {
  items: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "md";
}) {
  return (
    <div className="flex w-full items-center rounded-[14px] bg-secondary p-1">
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            type="button"
            onClick={() => onChange(it.value)}
            aria-pressed={active}
            className={[
              "flex-1 rounded-[11px] text-center font-semibold whitespace-nowrap transition-colors",
              size === "md" ? "h-[34px] text-[13px]" : "h-[28px] text-[12px]",
              active
                ? "bg-card text-foreground shadow-[0_1px_3px_rgba(23,31,53,0.10)]"
                : "text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
