"use client";

import { SidebarTrigger } from "@/components/ui/sidebar";

export default function MediaPage() {
  return (
    <div className="flex flex-1 flex-col space-y-4">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        <h1 className="text-2xl font-bold">媒体库</h1>
      </div>
      <p className="text-muted-foreground">暂无媒体文件</p>
    </div>
  );
}
