"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Plus, ArrowLeft, Edit, Trash2, Loader2, Sparkles, AlertCircle,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AdminTable } from "@/components/admin/admin-table";
import {
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AdminTripFormDialog } from "@/components/admin/trip-form-dialog";
import { TripPointFormDialog } from "@/components/admin/trip-point-form-dialog";
import {
  getTripBySlug,
  deleteTripPoint,
  type TripDetail,
  type TripPointPublic,
  type RecommendationPayload,
} from "@/lib/api";
import { POINT_TYPE_META, type PointType } from "@/lib/constants";

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function formatDist(meters: number | null): string {
  if (!meters) return "-";
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${meters} m`;
}

function parseRecommendation(aiRec: string | null): RecommendationPayload | null {
  if (!aiRec) return null;
  try {
    return JSON.parse(aiRec) as RecommendationPayload;
  } catch {
    return null;
  }
}

function RecommendationContent({ aiRec }: { aiRec: string | null }) {
  const rec = parseRecommendation(aiRec);
  if (!rec || (!rec.next_stop && rec.detours.length === 0)) {
    return <p className="py-2 text-sm text-muted-foreground">暂无推荐内容</p>;
  }
  return (
    <div className="space-y-3 py-2">
      {rec.next_stop && (
        <div className="rounded-md border p-3">
          <div className="flex items-center gap-2">
            <Badge variant="default">下一站</Badge>
            <span className="font-semibold">{rec.next_stop.name}</span>
            <span className="text-sm text-muted-foreground">约 {rec.next_stop.distance_km} km</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{rec.next_stop.reason}</p>
        </div>
      )}
      {rec.detours.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">周边值得绕路：</p>
          {rec.detours.map((d, i) => (
            <div key={i} className="rounded-md border p-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">P{d.priority}</span>
                <span className="font-medium">{d.name}</span>
                <Badge variant="secondary">{(POINT_TYPE_META[d.point_type as PointType] ?? POINT_TYPE_META.other).label}</Badge>
                <span className="text-sm text-muted-foreground">绕路 {d.detour_km} km</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{d.reason}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminTripDetailPage() {
  const router = useRouter();
  const params = useParams();
  const slug = params.slug as string;
  const { token } = useAuth();

  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // Trip edit dialog
  const [tripDialogOpen, setTripDialogOpen] = useState(false);

  // Point dialog
  const [pointDialogOpen, setPointDialogOpen] = useState(false);
  const [editingPoint, setEditingPoint] = useState<TripPointPublic | null>(null);

  // Delete point
  const [deleteTarget, setDeleteTarget] = useState<TripPointPublic | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // AI 推荐弹窗
  const [recTarget, setRecTarget] = useState<TripPointPublic | null>(null);

  const loadTrip = useCallback(async (silent = false) => {
    if (!token) return;
    if (!silent) setLoading(true);
    try {
      const data = await getTripBySlug(token, slug);
      setTrip(data);
    } catch (err) {
      if (!silent) toast.error(errorMessage(err, "加载行程失败"));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [token, slug]);

  useEffect(() => {
    loadTrip();
  }, [loadTrip]);

  // AI 推荐生成中 → 每 5s 静默轮询，直到无 pending
  useEffect(() => {
    if (!trip || !trip.points.some((p) => p.ai_rec_status === "pending")) return;
    const id = setInterval(() => loadTrip(true), 5000);
    return () => clearInterval(id);
  }, [trip, loadTrip]);

  const openCreatePoint = () => {
    setEditingPoint(null);
    setPointDialogOpen(true);
  };

  const openEditPoint = (point: TripPointPublic) => {
    setEditingPoint(point);
    setPointDialogOpen(true);
  };

  const handleDeletePoint = async () => {
    if (!deleteTarget || !token) return;
    setDeleteLoading(true);
    try {
      await deleteTripPoint(token, deleteTarget.trip_id, deleteTarget.id);
      toast.success("已删除");
      setDeleteTarget(null);
      loadTrip();
    } catch (err) {
      toast.error(errorMessage(err, "删除失败"));
    } finally {
      setDeleteLoading(false);
    }
  };

  const points = [...(trip?.points ?? [])].reverse();

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">加载中...</p>
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted-foreground">行程不存在</p>
        <Button variant="outline" size="sm" onClick={() => router.push("/admin/trips")}>
          返回列表
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col space-y-4">
      {/* 顶部：返回 + 标题 + 操作 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SidebarTrigger className="-ml-1" />
          <Button variant="ghost" size="icon" onClick={() => router.push("/admin/trips")} aria-label="返回">
            <ArrowLeft className="size-5" />
          </Button>
          <h1 className="text-2xl font-bold">{trip.title}</h1>
          <Badge variant={trip.status === "published" ? "default" : "secondary"}>
            {trip.status === "published" ? "已发布" : "草稿"}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setTripDialogOpen(true)}>
            <Edit className="size-4" /> 编辑行程
          </Button>
          <Button size="sm" onClick={openCreatePoint}>
            <Plus /> 添加记录点
          </Button>
        </div>
      </div>

      {/* 行程元信息 */}
      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
        {trip.start_date && (
          <span>{trip.start_date} ~ {trip.end_date || "至今"}</span>
        )}
        <span>{points.length} 个记录点</span>
        <span>累计 {formatDist(trip.total_distance)}</span>
      </div>

      {/* 记录点列表 */}
      <AdminTable
        loading={false}
        empty={points.length === 0}
        emptyText="还没有记录点，点击右上角添加第一个吧"
        colSpan={8}
        page={1}
        totalPages={1}
        onPageChange={() => {}}
        header={
          <TableHeader>
            <TableRow className="border-b-2 h-12 bg-muted/30">
              <TableHead className="text-center w-8">#</TableHead>
              <TableHead className="text-center w-[20%]">标题</TableHead>
              <TableHead className="text-center w-[10%]">类型</TableHead>
              <TableHead className="text-center w-[20%]">位置</TableHead>
              <TableHead className="text-center w-[15%]">到达时间</TableHead>
              <TableHead className="text-center w-[10%]">距下一点</TableHead>
              <TableHead className="text-center w-16">AI 推荐</TableHead>
              <TableHead className="text-center w-24">操作</TableHead>
            </TableRow>
          </TableHeader>
        }
      >
        {points.map((point, idx) => (
          <TableRow key={point.id} className="border-b">
            <td className="text-center text-muted-foreground">{idx + 1}</td>
            <td className="text-center font-medium">{point.title}</td>
            <td className="text-center">
              <Badge variant={(POINT_TYPE_META[point.point_type as PointType] ?? POINT_TYPE_META.other).variant}>
                {(POINT_TYPE_META[point.point_type as PointType] ?? POINT_TYPE_META.other).label}
              </Badge>
            </td>
            <td className="text-center text-muted-foreground text-sm">
              {point.location_name || (point.latitude ? `${point.latitude.toFixed(4)}, ${point.longitude?.toFixed(4)}` : "-")}
            </td>
            <td className="text-center text-muted-foreground text-sm">
              {point.arrived_at ? new Date(point.arrived_at).toLocaleString("zh-CN") : "-"}
            </td>
            <td className="text-center text-muted-foreground text-sm">
              {formatDist(point.distance_to_next)}
            </td>
            <td className="text-center">
              {point.ai_rec_status === "pending" && (
                <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="生成中" />
              )}
              {point.ai_rec_status === "ready" && (
                <Button variant="ghost" size="icon" aria-label="查看推荐" title="查看推荐" onClick={() => setRecTarget(point)}>
                  <Sparkles className="size-4" />
                </Button>
              )}
              {point.ai_rec_status === "failed" && (
                <AlertCircle className="size-4 text-destructive" aria-label="推荐失败" />
              )}
            </td>
            <td className="text-center">
              <div className="flex items-center justify-center gap-0">
                <Button variant="ghost" size="icon" aria-label="编辑" title="编辑" onClick={() => openEditPoint(point)}>
                  <Edit className="size-4" />
                </Button>
                <Button variant="ghost" size="icon" aria-label="删除" title="删除" onClick={() => setDeleteTarget(point)}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            </td>
          </TableRow>
        ))}
      </AdminTable>

      {/* 行程编辑弹窗 */}
      {trip && (
        <AdminTripFormDialog
          open={tripDialogOpen}
          onOpenChange={setTripDialogOpen}
          trip={trip}
          onSaved={loadTrip}
        />
      )}

      {/* 记录点编辑弹窗 */}
      {trip && (
        <TripPointFormDialog
          open={pointDialogOpen}
          onOpenChange={setPointDialogOpen}
          tripId={trip.id}
          point={editingPoint}
          onSaved={loadTrip}
        />
      )}

      {/* AI 推荐弹窗 */}
      <Dialog open={!!recTarget} onOpenChange={() => setRecTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>AI 下一程推荐</DialogTitle>
            <DialogDescription>
              基于「{recTarget?.title}」及最近行程生成，仅供参考
            </DialogDescription>
          </DialogHeader>
          <RecommendationContent aiRec={recTarget?.ai_rec ?? null} />
        </DialogContent>
      </Dialog>

      {/* 删除记录点确认 */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除记录点</DialogTitle>
            <DialogDescription>
              将删除「{deleteTarget?.title}」及其关联照片。此操作无法恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>取消</Button>
            <Button variant="destructive" onClick={handleDeletePoint} disabled={deleteLoading}>删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
