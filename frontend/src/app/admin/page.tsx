"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, CalendarDays, Eye } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchStatsOverview,
  fetchPostStats,
  type StatsOverview,
  type PostViewStat,
} from "@/lib/api";

export default function AdminDashboard() {
  const { user, token } = useAuth();
  const [overview, setOverview] = useState<StatsOverview | null>(null);
  const [posts, setPosts] = useState<PostViewStat[] | null>(null);

  useEffect(() => {
    if (!token) return;
    let active = true;
    Promise.all([fetchStatsOverview(token), fetchPostStats(token, 10)])
      .then(([o, p]) => {
        if (!active) return;
        setOverview(o);
        setPosts(p);
      })
      .catch(() => {
        if (active) {
          setOverview({ visitors_today: 0, visitors_total: 0 });
          setPosts([]);
        }
      });
    return () => {
      active = false;
    };
  }, [token]);

  return (
    <div className="flex flex-1 flex-col space-y-6">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        <h1 className="text-2xl font-bold">仪表盘</h1>
      </div>
      <p className="text-muted-foreground">欢迎回来，{user?.username}！</p>

      {/* 访客量卡片 */}
      <div className="grid gap-4 sm:grid-cols-2 lg:max-w-2xl">
        <StatCard
          icon={<CalendarDays className="size-4" />}
          label="今日访客"
          value={overview?.visitors_today}
        />
        <StatCard
          icon={<Users className="size-4" />}
          label="累计访客"
          value={overview?.visitors_total}
        />
      </div>

      {/* 热门文章榜 */}
      <Card className="lg:max-w-2xl">
        <CardHeader>
          <CardTitle className="text-base">热门文章</CardTitle>
          <CardDescription>
            按浏览量排序（半小时内同一访客只计一次）
          </CardDescription>
        </CardHeader>
        <CardContent>
          {posts === null ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : posts.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              暂无浏览数据
            </p>
          ) : (
            <ol className="space-y-1">
              {posts.map((p, i) => (
                <li key={p.id}>
                  <Link
                    href={`/blog/${p.slug}`}
                    target="_blank"
                    className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted"
                  >
                    <span className="w-5 shrink-0 text-center font-mono text-xs text-muted-foreground">
                      {i + 1}
                    </span>
                    <span className="flex-1 truncate">{p.title}</span>
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                      <Eye className="size-3.5" />
                      {p.views}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | undefined;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-1.5">
          {icon}
          {label}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {value === undefined ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <p className="text-3xl font-bold tabular-nums">{value}</p>
        )}
      </CardContent>
    </Card>
  );
}
