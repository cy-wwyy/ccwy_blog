"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Edit, Trash2, MapPin } from "lucide-react";
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
import {
  fetchAdminTrips,
  deleteTrip,
  type TripPublic,
} from "@/lib/api";
import { PAGE_SIZE } from "@/lib/constants";

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

const STATUS_META: Record<string, { label: string; variant: "default" | "secondary" }> = {
  published: { label: "已发布", variant: "default" },
  draft: { label: "草稿", variant: "secondary" },
};

function formatDist(meters: number | null): string {
  if (!meters) return "-";
  if (meters >= 1000) return `${(meters / 1000).toFixed(0)} km`;
  return `${meters} m`;
}

export default function AdminTripsPage() {
  const router = useRouter();
  const { token } = useAuth();
  const [trips, setTrips] = useState<TripPublic[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TripPublic | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TripPublic | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    if (!token) return;
    let active = true;
    (async () => {
      try {
        const res = await fetchAdminTrips(token, {
          skip: (page - 1) * PAGE_SIZE,
          limit: PAGE_SIZE,
        });
        if (active) {
          setTrips(res.data);
          setTotal(res.count);
        }
      } catch (err) {
        if (active) toast.error(errorMessage(err, "加载行程失败"));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [token, page, reload]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (trip: TripPublic) => {
    setEditing(trip);
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget || !token) return;
    setDeleteLoading(true);
    try {
      await deleteTrip(token, deleteTarget.id);
      toast.success("已删除");
      setDeleteTarget(null);
      if (trips.length === 1 && page > 1) setPage(page - 1);
      else setReload((r) => r + 1);
    } catch (err) {
      toast.error(errorMessage(err, "删除失败"));
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SidebarTrigger className="-ml-1" />
          <h1 className="text-2xl font-bold">行程</h1>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus /> 新建行程
        </Button>
      </div>

      <AdminTable
        loading={loading}
        empty={trips.length === 0}
        emptyText="还没有行程，点击右上角新建一个吧"
        colSpan={6}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        header={
          <TableHeader>
            <TableRow className="border-b-2 h-12 bg-muted/30">
              <TableHead className="text-center w-[25%]">标题</TableHead>
              <TableHead className="text-center w-[12%]">日期</TableHead>
              <TableHead className="text-center w-[10%]">记录点</TableHead>
              <TableHead className="text-center w-[10%]">里程</TableHead>
              <TableHead className="text-center w-[8%]">状态</TableHead>
              <TableHead className="text-center w-24">操作</TableHead>
            </TableRow>
          </TableHeader>
        }
      >
        {trips.map((trip) => (
          <TableRow key={trip.id} className="border-b">
            <td className="text-center">
              <button
                type="button"
                onClick={() => router.push(`/admin/trips/${trip.slug}`)}
                className="font-medium hover:underline text-left"
              >
                {trip.title}
              </button>
            </td>
            <td className="text-center text-muted-foreground text-sm">
              {trip.start_date ? `${trip.start_date} ~ ${trip.end_date || "-"}` : "-"}
            </td>
            <td className="text-center">
              <Badge variant="outline" className="gap-1">
                <MapPin className="size-3" />
                {trip.point_count}
              </Badge>
            </td>
            <td className="text-center text-muted-foreground text-sm">
              {formatDist(trip.total_distance)}
            </td>
            <td className="text-center">
              {STATUS_META[trip.status] && (
                <Badge variant={STATUS_META[trip.status].variant}>
                  {STATUS_META[trip.status].label}
                </Badge>
              )}
            </td>
            <td className="text-center">
              <div className="flex items-center justify-center gap-0">
                <Button variant="ghost" size="icon" aria-label="编辑" title="编辑" onClick={() => openEdit(trip)}>
                  <Edit className="size-4" />
                </Button>
                <Button variant="ghost" size="icon" aria-label="删除" title="删除" onClick={() => setDeleteTarget(trip)}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            </td>
          </TableRow>
        ))}
      </AdminTable>

      <AdminTripFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        trip={editing}
        onSaved={() => { setReload((r) => r + 1); }}
      />

      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除行程</DialogTitle>
            <DialogDescription>
              将删除「{deleteTarget?.title}」及其所有记录点和照片关联。此操作无法恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>取消</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteLoading}>删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
