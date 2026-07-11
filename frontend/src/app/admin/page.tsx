"use client";

import { useAuth } from "@/hooks/use-auth";
import { SidebarTrigger } from "@/components/ui/sidebar";

export default function AdminDashboard() {
  const { user } = useAuth();

  return (
    <div className="flex flex-1 flex-col space-y-6">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        <h1 className="text-2xl font-bold">仪表盘</h1>
      </div>
      <p className="text-muted-foreground">
        欢迎回来，{user?.username}！
      </p>
    </div>
  );
}
