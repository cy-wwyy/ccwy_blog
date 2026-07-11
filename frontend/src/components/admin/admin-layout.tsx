"use client";

import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AdminSidebar } from "./admin-sidebar";

export function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AdminSidebar />
      <SidebarInset>
        <main className="flex flex-1 flex-col px-4 pb-[22px] pt-3">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
