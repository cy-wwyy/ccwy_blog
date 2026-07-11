"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { PenLine, Users, ArrowRight, TrendingUp } from "lucide-react";
import { fetchPublicPosts } from "@/lib/api";

export function SiteRightAside() {
  const [postCount, setPostCount] = useState<number | null>(null);

  useEffect(() => {
    fetchPublicPosts({ limit: 1 })
      .then((r) => setPostCount(r.count))
      .catch(() => setPostCount(0));
  }, []);

  return (
    <aside className="p-4 space-y-5 pt-8">
      {/* 站点统计 */}
      <div>
        <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">站点统计</h3>
        <div className="space-y-2.5">
          <div className="flex items-center gap-2.5 text-sm">
            <PenLine size={14} className="text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">文章</span>
            {postCount !== null ? (
              <span className="ml-auto font-bold">{postCount}</span>
            ) : (
              <Skeleton className="ml-auto h-4 w-6" />
            )}
          </div>
          {/* 访客数 — 后端访客统计接口就绪后接入 */}
          <div className="flex items-center gap-2.5 text-sm">
            <Users size={14} className="text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">访客</span>
            <span className="ml-auto text-xs text-muted-foreground">—</span>
          </div>
          <div className="flex items-center gap-2.5 text-sm">
            <TrendingUp size={14} className="text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">更新</span>
            <span className="ml-auto text-xs text-muted-foreground">持续中</span>
          </div>
        </div>
      </div>

      {/* 标签云 — 占位 */}
      <div>
        <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">标签</h3>
        <div className="flex flex-wrap gap-1.5">
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">技术</span>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">生活</span>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">编程</span>
        </div>
      </div>

      {/* CTA */}
      <Link
        href="/blog"
        className="flex items-center justify-center gap-1.5 w-full rounded-lg bg-primary text-primary-foreground text-xs font-medium py-2 hover:opacity-90 transition-opacity"
      >
        <PenLine size={13} />
        浏览全部文章
        <ArrowRight size={12} />
      </Link>
    </aside>
  );
}
