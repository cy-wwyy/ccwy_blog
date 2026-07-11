import type { Metadata } from "next";
import { Info } from "lucide-react";

export const metadata: Metadata = {
  title: "关于 | ccwy blog",
  description: "关于",
};

export default function AboutPage() {
  return (
    <div className="flex flex-col items-center justify-center py-32 text-center gap-3">
      <Info className="size-10 text-muted-foreground/40" />
      <h1 className="text-lg font-semibold">关于</h1>
      <p className="text-sm text-muted-foreground">页面建设中，敬请期待。</p>
    </div>
  );
}
