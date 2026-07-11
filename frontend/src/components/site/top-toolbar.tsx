"use client";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "./theme-toggle";
import { Search, Settings, LogIn } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";

export function TopToolbar() {
  const [query, setQuery] = useState("");
  const { isLoggedIn } = useAuth();
  const router = useRouter();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/blog?search=${encodeURIComponent(query.trim())}`);
    }
  };

  return (
    <header className="theme-topbar sticky top-0 z-20 flex h-12 items-center gap-3 border-b px-4 shrink-0">
      {/* 侧边栏触发器 — 移动端 */}
      <SidebarTrigger className="md:hidden" />

      {/* Logo — 移动端显示 */}
      <span className="font-semibold text-sm md:hidden">CCWY</span>

      {/* 搜索框 */}
      <form onSubmit={handleSearch} className="flex-1 flex justify-center">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search..."
            aria-label="搜索文章"
            className="w-full h-8 pl-8 pr-3 text-sm rounded-md border bg-background outline-none focus:border-primary/30"
          />
        </div>
      </form>

      {/* 右侧操作 */}
      <div className="flex items-center gap-1">
        <ThemeToggle />
        {isLoggedIn ? (
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
          >
            <Settings size={14} />
            <span className="hidden sm:inline">后台</span>
          </Link>
        ) : (
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
          >
            <LogIn size={14} />
            <span className="hidden sm:inline">登录</span>
          </Link>
        )}
      </div>
    </header>
  );
}
