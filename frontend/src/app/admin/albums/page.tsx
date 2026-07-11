"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";
import { ImageIcon, Plus, MoreVertical, Edit, Trash2, Lock } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { AlbumFormDialog } from "@/components/admin/album-form-dialog";
import { fetchAlbums, deleteAlbum, type AlbumPublic } from "@/lib/api";

const ALBUM_PAGE_SIZE = 12;

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export default function AlbumsPage() {
  const router = useRouter();
  const { token } = useAuth();
  const [albums, setAlbums] = useState<AlbumPublic[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AlbumPublic | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AlbumPublic | null>(null);

  useEffect(() => {
    if (!token) return;
    let active = true;
    (async () => {
      try {
        const res = await fetchAlbums(token, {
          skip: (page - 1) * ALBUM_PAGE_SIZE,
          limit: ALBUM_PAGE_SIZE,
        });
        if (active) {
          setAlbums(res.data);
          setTotal(res.count);
        }
      } catch (err) {
        if (active) toast.error(errorMessage(err, "加载相册失败"));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [token, page, reload]);

  const totalPages = Math.max(1, Math.ceil(total / ALBUM_PAGE_SIZE));

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (album: AlbumPublic) => {
    setEditing(album);
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget || !token) return;
    try {
      await deleteAlbum(token, deleteTarget.id);
      toast.success("已删除");
      setDeleteTarget(null);
      if (albums.length === 1 && page > 1) setPage(page - 1);
      else setReload((r) => r + 1);
    } catch (err) {
      toast.error(errorMessage(err, "删除失败"));
    }
  };

  return (
    <div className="flex flex-1 flex-col space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SidebarTrigger className="-ml-1" />
          <h1 className="text-2xl font-bold">相册</h1>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus /> 新建相册
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">加载中...</p>
      ) : albums.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-20 text-muted-foreground">
          <ImageIcon className="size-8" />
          <p className="text-sm">还没有相册，点击右上角新建一个吧</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {albums.map((album) => (
            <div
              key={album.id}
              className="group relative overflow-hidden rounded-lg border bg-card transition-shadow hover:shadow-md"
            >
              <button
                type="button"
                onClick={() => router.push(`/admin/albums/${album.slug}`)}
                className="block w-full text-left"
                title={`管理「${album.title}」的照片`}
              >
                <div className="relative aspect-video w-full overflow-hidden bg-muted">
                  {album.cover_url ? (
                    <Image
                      src={album.cover_url}
                      alt={album.title}
                      fill
                      unoptimized
                      className="object-cover transition-transform group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      <ImageIcon className="size-7" />
                    </div>
                  )}
                  {!album.is_public && (
                    <Badge
                      variant="secondary"
                      className="absolute left-2 top-2 gap-1"
                    >
                      <Lock className="size-3" /> 私密
                    </Badge>
                  )}
                </div>
                <div className="p-3">
                  <p className="truncate font-medium" title={album.title}>
                    {album.title}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {album.photo_count} 张照片
                  </p>
                </div>
              </button>

              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="secondary"
                      size="icon"
                      className="absolute right-2 top-2 size-7 opacity-0 transition-opacity group-hover:opacity-100 data-[popup-open]:opacity-100"
                      aria-label="更多操作"
                    />
                  }
                >
                  <MoreVertical className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => openEdit(album)}>
                    <Edit className="size-4" /> 编辑信息
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setDeleteTarget(album)}>
                    <Trash2 className="size-4 text-destructive" /> 删除
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  if (page > 1) setPage(page - 1);
                }}
              />
            </PaginationItem>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <PaginationItem key={p}>
                <PaginationLink
                  href="#"
                  isActive={page === p}
                  onClick={(e) => {
                    e.preventDefault();
                    setPage(p);
                  }}
                >
                  {p}
                </PaginationLink>
              </PaginationItem>
            ))}
            <PaginationItem>
              <PaginationNext
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  if (page < totalPages) setPage(page + 1);
                }}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}

      <AlbumFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        album={editing}
        onSaved={() => setReload((r) => r + 1)}
      />

      {/* 删除确认 */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除相册</DialogTitle>
            <DialogDescription>
              将删除「{deleteTarget?.title}」及其所有照片挂载记录（原始文件保留在媒体库）。此操作无法恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
