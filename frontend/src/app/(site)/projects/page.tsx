import type { Metadata } from "next";
import { Images } from "lucide-react";

export const metadata: Metadata = {
  title: "作品集 | ccwy blog",
  description: "作品集",
};

export default function ProjectsPage() {
  return (
    <div className="flex flex-col items-center justify-center py-32 text-center gap-3">
      <Images className="size-10 text-muted-foreground/40" />
      <h1 className="text-lg font-semibold">作品集</h1>
      <p className="text-sm text-muted-foreground">页面建设中，敬请期待。</p>
    </div>
  );
}
