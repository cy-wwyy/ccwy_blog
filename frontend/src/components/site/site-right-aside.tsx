"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { PenLine, Users, ArrowRight, TrendingUp, Tag } from "lucide-react";
import { fetchPublicPosts, fetchSiteStats, fetchPublicTags } from "@/lib/api";
import type { TagPublic } from "@/lib/api";

export function SiteRightAside() {
  const [postCount, setPostCount] = useState<number | null>(null);
  const [visitors, setVisitors] = useState<number | null>(null);
  const [tags, setTags] = useState<TagPublic[] | null>(null);

  useEffect(() => {
    fetchPublicPosts({ limit: 1 })
      .then((r) => setPostCount(r.count))
      .catch(() => setPostCount(0));
    fetchSiteStats()
      .then((s) => setVisitors(s.visitors_total))
      .catch(() => setVisitors(0));
    fetchPublicTags()
      .then(setTags)
      .catch(() => setTags([]));
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
          {/* 访客数 — 整站累计独立访客（UV） */}
          <div className="flex items-center gap-2.5 text-sm">
            <Users size={14} className="text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">访客</span>
            {visitors !== null ? (
              <span className="ml-auto font-bold">{visitors}</span>
            ) : (
              <Skeleton className="ml-auto h-4 w-6" />
            )}
          </div>
          <div className="flex items-center gap-2.5 text-sm">
            <TrendingUp size={14} className="text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">更新</span>
            <span className="ml-auto text-xs text-muted-foreground">持续中</span>
          </div>
        </div>
      </div>

      {/* 标签云 */}
      {tags !== null && tags.length > 0 && (
        <div>
          <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">标签</h3>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <Link
                key={tag.id}
                href={`/blog?tag=${encodeURIComponent(tag.slug)}`}
                className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
              >
                {tag.name}
              </Link>
            ))}
          </div>
        </div>
      )}
      {tags !== null && tags.length === 0 && (
        <div>
          <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">标签</h3>
          <div className="flex flex-wrap gap-1.5">
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
              <Tag size={10} className="inline mr-0.5" />
              暂无标签
            </span>
          </div>
        </div>
      )}

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
