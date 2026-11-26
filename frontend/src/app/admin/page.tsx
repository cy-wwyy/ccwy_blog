"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  ExternalLink,
  Eye,
  FileText,
  PenLine,
  Users,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import {
  fetchAdminPosts,
  fetchPostStats,
  fetchStatsDaily,
  fetchStatsHourly,
  fetchStatsOverview,
  type DailyStat,
  type HourlyStat,
  type PostPublic,
  type PostViewStat,
  type StatsOverview,
} from "@/lib/api";
import { AreaTrend } from "@/components/admin/charts/area-trend";
import { HourlyHeatmap } from "@/components/admin/charts/heatmap";
import { SparkBars } from "@/components/admin/charts/spark-bars";
import { Segmented } from "@/components/admin/nova/segmented";

const nf = new Intl.NumberFormat("zh-CN");

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function weekdayShort(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];
}

export default function AdminDashboard() {
  const { token, user } = useAuth();

  const [overview, setOverview] = useState<StatsOverview | null>(null);
  const [topPosts, setTopPosts] = useState<PostViewStat[] | null>(null);
  const [posts, setPosts] = useState<PostPublic[] | null>(null);
  const [totalPosts, setTotalPosts] = useState(0);
  const [daily, setDaily] = useState<DailyStat[] | null>(null);
  const [hourly, setHourly] = useState<HourlyStat[] | null>(null);

  const [scope, setScope] = useState<"total" | "today">("total");
  const [range, setRange] = useState<"7" | "30">("30");

  // 概览 + 榜单 + 文章列表
  useEffect(() => {
    if (!token) return;
    let alive = true;
    Promise.all([
      fetchStatsOverview(token),
      fetchPostStats(token, 10),
      fetchAdminPosts(token, { limit: 100, sort_by: "created_at", sort_order: "desc" }),
    ])
      .then(([ov, top, list]) => {
        if (!alive) return;
        setOverview(ov);
        setTopPosts(top);
        setPosts(list.data);
        setTotalPosts(list.count);
      })
      .catch(() => {
        if (!alive) return;
        setOverview({ visitors_today: 0, visitors_total: 0 });
        setTopPosts([]);
        setPosts([]);
      });
    return () => {
      alive = false;
    };
  }, [token]);

  // 时序 + 热力
  useEffect(() => {
    if (!token) return;
    let alive = true;
    Promise.all([
      fetchStatsDaily(token, { days: Number(range), kind: "site" }),
      fetchStatsHourly(token, { days: 7, kind: "site" }),
    ])
      .then(([d, h]) => {
        if (!alive) return;
        setDaily(d);
        setHourly(h);
      })
      .catch(() => {
        if (alive) {
          setDaily([]);
          setHourly([]);
        }
      });
    return () => {
      alive = false;
    };
  }, [token, range]);

  const derived = useMemo(() => {
    const list = posts ?? [];
    const published = list.filter((p) => p.status === "published");
    const drafts = list.filter((p) => p.status !== "published");
    const recent = [...list]
      .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""))
      .slice(0, 5);
    const reads = (daily ?? []).map((d) => d.views);
    const totalReads = reads.reduce((s, n) => s + n, 0);
    const avg = daily && daily.length ? Math.round(totalReads / daily.length) : 0;
    const todayReads = daily && daily.length ? daily[daily.length - 1].views : 0;
    return { published, drafts, recent, totalReads, avg, todayReads };
  }, [posts, daily]);

  const bigValue =
    scope === "total" ? overview?.visitors_total ?? 0 : overview?.visitors_today ?? 0;

  return (
    <div className="grid gap-4 pt-1 xl:h-full xl:grid-cols-[320px_minmax(0,1fr)_320px]">
      {/* ══ 左栏 ══════════════════════════════════════════ */}
      <div className="flex min-h-0 min-w-0 flex-col gap-3">
        <section className="shrink-0 rounded-[22px] border border-border bg-card p-4">
          <Segmented
            items={[
              { value: "total", label: "累计访客" },
              { value: "today", label: "今日访客" },
            ]}
            value={scope}
            onChange={setScope}
          />

          <div className="mt-3.5 flex items-end gap-2">
            <span className="text-[31px] leading-none font-semibold tracking-[-0.02em] tabular-nums">
              {nf.format(bigValue)}
            </span>
            <span className="mb-1 text-[12.5px] text-muted-foreground">
              人{scope === "today" ? "（今日）" : "（累计独立）"}
            </span>
          </div>

          <div className="mt-2.5 flex items-center gap-3 text-[12.5px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Users className="size-3.5" />
              按访客去重
            </span>
            <span className="flex items-center gap-1.5">
              <Eye className="size-3.5" />
              {nf.format(derived.todayReads)} 次今日访问
            </span>
          </div>

          <div className="mt-3.5 grid grid-cols-3 gap-2 border-t border-border pt-3.5">
            <Stat label="文章" value={nf.format(totalPosts)} />
            <Stat label="已发布" value={nf.format(derived.published.length)} />
            <Stat label="草稿" value={nf.format(derived.drafts.length)} />
          </div>

          <div className="mt-3.5 grid grid-cols-2 gap-2">
            <Link
              href="/admin/posts/new"
              className="flex h-[44px] items-center justify-center gap-2 rounded-[14px] bg-primary text-[13.5px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              <PenLine className="size-4" />
              写文章
            </Link>
            <Link
              href="/blog"
              target="_blank"
              className="flex h-[44px] items-center justify-center gap-2 rounded-[14px] border border-primary/40 text-[13.5px] font-semibold text-primary transition-colors hover:bg-accent"
            >
              <ExternalLink className="size-4" />
              看前台
            </Link>
          </div>
        </section>

        {/* 热门文章榜 */}
        <section className="flex min-h-0 flex-1 flex-col rounded-[22px] border border-border bg-card p-4">
          <header className="mb-2 flex items-center justify-between">
            <h2 className="text-[14px] font-semibold">热门文章</h2>
            <span className="text-[11.5px] text-muted-foreground">按浏览量</span>
          </header>

          {topPosts === null ? (
            <SkeletonRows n={6} />
          ) : topPosts.length === 0 ? (
            <Empty text="还没有浏览数据" />
          ) : (
            <ul className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
              {topPosts.slice(0, 6).map((p, i) => (
                <li key={p.id}>
                  <Link
                    href={`/admin/posts/${p.slug}`}
                    className="flex h-[38px] items-center gap-2 rounded-[10px] px-1 transition-colors hover:bg-secondary"
                  >
                    <span className="w-4 shrink-0 text-[11px] tabular-nums text-muted-foreground">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                      {p.title}
                    </span>
                    <span className="flex shrink-0 items-center gap-1 text-[12px] tabular-nums text-muted-foreground">
                      <Eye className="size-3" />
                      {nf.format(p.views)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 近 7 日访问 */}
        <section className="shrink-0 rounded-[22px] border border-border bg-card p-3.5">
          <div className="flex items-baseline gap-2">
            <span className="text-[19px] font-semibold tabular-nums">
              {nf.format((daily ?? []).slice(-7).reduce((s, d) => s + d.views, 0))}
            </span>
            <span className="text-[11.5px] text-muted-foreground">近 7 日访问</span>
          </div>
          <div className="mt-2 h-[52px]">
            <SparkBars values={(daily ?? []).slice(-7).map((d) => d.views)} height={52} />
          </div>
        </section>
      </div>

      {/* ══ 中栏 ══════════════════════════════════════════ */}
      <div className="flex min-h-0 min-w-0 flex-col gap-3">
        <section className="shrink-0 rounded-[22px] border border-border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-[16px] font-semibold tracking-tight">访问趋势</h2>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                按本地日聚合的站点访问量（PV）
              </p>
            </div>
            <Segmented
              items={[
                { value: "7", label: "近 7 天" },
                { value: "30", label: "近 30 天" },
              ]}
              value={range}
              onChange={setRange}
              size="sm"
            />
          </div>

          <div className="mt-3 grid grid-cols-3 gap-3 border-t border-border pt-3">
            <Stat label={`${range} 日访问`} value={nf.format(derived.totalReads)} big />
            <Stat label="日均" value={nf.format(derived.avg)} big />
            <Stat label="今日" value={nf.format(derived.todayReads)} big />
          </div>

          <div className="mt-2">
            {daily === null ? (
              <div className="h-[210px] animate-pulse rounded-xl bg-secondary" />
            ) : (
              <AreaTrend
                data={daily.map((d) => ({ label: d.date.slice(5), value: d.views }))}
                height={210}
                average={derived.avg}
              />
            )}
          </div>

          <div className="mt-3 border-t border-border pt-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[13px] font-semibold">时段热力</h3>
              <span className="text-[11px] text-muted-foreground">
                近 7 天 · 星期 × 小时
              </span>
            </div>
            {hourly === null ? (
              <div className="h-[112px] animate-pulse rounded-xl bg-secondary" />
            ) : hourly.length === 0 ? (
              <Empty text="还没有数据" />
            ) : (
              <HourlyHeatmap data={hourly} />
            )}
          </div>
        </section>

        {/* 最近文章 */}
        <section className="flex min-h-0 flex-1 flex-col rounded-[22px] border border-border bg-card p-4">
          <header className="mb-2 flex items-center justify-between">
            <h2 className="text-[14px] font-semibold">最近文章</h2>
            <Link
              href="/admin/posts"
              className="flex items-center gap-1 text-[12px] font-semibold text-primary hover:underline"
            >
              全部 {totalPosts} 篇
              <ArrowUpRight className="size-3" />
            </Link>
          </header>

          {posts === null ? (
            <SkeletonRows n={4} />
          ) : derived.recent.length === 0 ? (
            <Empty text="还没有文章，去写一篇" />
          ) : (
            <ul className="divide-y divide-border">
              {derived.recent.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/admin/posts/${p.slug}`}
                    className="flex h-[46px] items-center gap-3 rounded-[10px] px-1 transition-colors hover:bg-secondary"
                  >
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">
                      {p.title}
                    </span>
                    <StatusDot status={p.status} />
                    <span className="w-[56px] shrink-0 text-right text-[11.5px] tabular-nums text-muted-foreground">
                      {fmtDate(p.updated_at)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* ══ 右栏 ══════════════════════════════════════════ */}
      <div className="flex min-w-0 flex-col gap-3">
        <section className="flex min-h-0 flex-1 flex-col rounded-[22px] border border-border bg-card p-4">
          <header className="mb-2 flex items-center justify-between">
            <h2 className="text-[14px] font-semibold">最近更新</h2>
            <span className="text-[11.5px] text-muted-foreground">
              {user?.username ? `@${user.username}` : ""}
            </span>
          </header>

          {posts === null ? (
            <SkeletonRows n={5} />
          ) : (
            <ul className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
              {derived.recent.map((p) => (
                <li key={p.id} className="py-2">
                  <Link href={`/admin/posts/${p.slug}`} className="group block">
                    <div className="flex items-start justify-between gap-2">
                      <span className="line-clamp-2 text-[13px] font-medium group-hover:text-primary">
                        {p.title}
                      </span>
                      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                        周{weekdayShort(p.updated_at)} {fmtDate(p.updated_at)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <StatusDot status={p.status} />
                      <span className="tabular-nums">{p.slug}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 内容构成 */}
        <section className="rounded-[22px] border border-border bg-card p-4">
          <h2 className="mb-3 text-[14px] font-semibold">内容构成</h2>
          <div className="flex h-2 overflow-hidden rounded-full bg-secondary">
            <span
              className="h-full bg-primary"
              style={{
                width: `${
                  totalPosts > 0
                    ? (derived.published.length / Math.max(totalPosts, 1)) * 100
                    : 0
                }%`,
              }}
            />
            <span
              className="h-full bg-[var(--nova-amber)]"
              style={{
                width: `${
                  totalPosts > 0
                    ? (derived.drafts.length / Math.max(totalPosts, 1)) * 100
                    : 0
                }%`,
              }}
            />
          </div>
          <div className="mt-2.5 flex items-center justify-between text-[12px]">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="size-2 rounded-full bg-primary" />
              已发布
              <span className="font-semibold tabular-nums text-foreground">
                {derived.published.length}
              </span>
            </span>
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="size-2 rounded-full bg-[var(--nova-amber)]" />
              草稿
              <span className="font-semibold tabular-nums text-foreground">
                {derived.drafts.length}
              </span>
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  big,
}: {
  label: string;
  value: string;
  big?: boolean;
}) {
  return (
    <div>
      <div
        className={
          big
            ? "text-[15.5px] font-semibold tabular-nums"
            : "text-[15px] font-semibold tabular-nums"
        }
      >
        {value}
      </div>
      <div className="mt-0.5 text-[11.5px] text-muted-foreground">{label}</div>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const published = status === "published";
  return (
    <span
      className={[
        "inline-flex h-[20px] shrink-0 items-center gap-1 rounded-[6px] px-1.5 text-[10.5px] font-semibold",
        published
          ? "bg-[var(--nova-mint)]/12 text-[var(--nova-mint)]"
          : "bg-secondary text-muted-foreground",
      ].join(" ")}
    >
      <span
        className={[
          "size-[5px] rounded-full",
          published ? "bg-[var(--nova-mint)]" : "bg-[var(--nova-faint)]",
        ].join(" ")}
      />
      {published ? "已发布" : "草稿"}
    </span>
  );
}

function SkeletonRows({ n }: { n: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="h-8 animate-pulse rounded-lg bg-secondary" />
      ))}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="py-8 text-center text-[12.5px] text-muted-foreground">{text}</p>
  );
}
