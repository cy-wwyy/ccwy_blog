"use client";

import { useEffect } from "react";
import { AdminShell } from "./shell/admin-shell";

export function AdminLayout({ children }: { children: React.ReactNode }) {
  // 1) 作用域挂在包裹层上，保证 SSR 首屏就是 Nova 配色；
  // 2) 同步到 <html>，让 Dialog / Dropdown 等 portal 到 body 的浮层
  //    也能读到这套变量；离开 admin 时移除，前台完全不受影响。
  useEffect(() => {
    const el = document.documentElement;
    el.setAttribute("data-admin-root", "");
    return () => el.removeAttribute("data-admin-root");
  }, []);

  return (
    <div data-admin-root className="bg-background text-foreground">
      <AdminShell>{children}</AdminShell>
    </div>
  );
}
