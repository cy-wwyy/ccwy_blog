"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { LogOut, X } from "lucide-react";
import { BrandMark } from "./brand-mark";
import { IconRail } from "./icon-rail";
import { TopBar, MobileNavLink } from "./top-bar";
import { isActive, navItems, settingsItems } from "./nav";
import { useAuth } from "@/hooks/use-auth";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  // 路由变化时关掉移动端抽屉
  useEffect(() => setMenuOpen(false), [pathname]);

  // 抽屉打开时锁背景滚动
  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  return (
    <div className="h-svh overflow-hidden bg-background p-0 sm:p-3 lg:p-4">
      {/* 浮岛：圆角 28 + 大模糊阴影 + 1px 描边 */}
      <div className="flex h-full overflow-hidden bg-card shadow-[var(--nova-shadow-island)] ring-1 ring-border sm:rounded-[28px]">
        <IconRail />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar onOpenMenu={() => setMenuOpen(true)} />
          <main className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-5 lg:px-5 lg:pt-5">
            {children}
          </main>
        </div>
      </div>

      {/* 移动端导航抽屉 */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="关闭导航"
            onClick={() => setMenuOpen(false)}
            className="absolute inset-0 bg-black/35"
          />
          <div className="absolute inset-y-0 left-0 flex w-[272px] flex-col bg-card p-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <Link href="/admin" className="flex items-center gap-2">
                <BrandMark size={26} />
                <span className="text-[15px] font-semibold">Nova 后台</span>
              </Link>
              <button
                type="button"
                aria-label="关闭"
                onClick={() => setMenuOpen(false)}
                className="flex size-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-secondary"
              >
                <X className="size-4" />
              </button>
            </div>

            <nav className="flex flex-col gap-1">
              {[...navItems, ...settingsItems].map((item) => (
                <MobileNavLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  icon={item.icon}
                  active={isActive(pathname, item)}
                  onNavigate={() => setMenuOpen(false)}
                />
              ))}
            </nav>

            <span className="my-2 block h-px bg-border" />
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                logout();
              }}
              className="flex h-11 items-center gap-3 rounded-xl px-3 text-[14px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <LogOut className="size-[18px]" strokeWidth={1.9} />
              退出登录
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
