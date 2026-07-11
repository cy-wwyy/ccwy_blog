"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowLeft,
  ImagePlus,
  Loader2,
  Star,
  Trash2,
  GripVertical,
  Pencil,
  Lock,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlbumFormDialog } from "@/components/admin/album-form-dialog";
import {
  getAlbumBySlug,
  uploadMedia,
  addAlbumPhoto,
  updateAlbumPhoto,
  deleteAlbumPhoto,
  updateAlbum,
  type AlbumDetail,
  type AlbumPhotoPublic,
} from "@/lib/api";

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

// ── 单张可拖拽照片卡片 ──────────────────────────────────

interface SortablePhotoProps {
  photo: AlbumPhotoPublic;
  isCover: boolean;
  onEditCaption: (photo: AlbumPhotoPublic) => void;
  onSetCover: (photo: AlbumPhotoPublic) => void;
  onDelete: (photo: AlbumPhotoPublic) => void;
}

function SortablePhoto({
  photo,
  isCover,
  onEditCaption,
  onSetCover,
  onDelete,
}: SortablePhotoProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: photo.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group relative overflow-hidden rounded-lg border bg-card"
    >
      <div className="relative aspect-square w-full overflow-hidden bg-muted">
        <Image
          src={photo.url}
          alt={photo.caption || "照片"}
          fill
          unoptimized
          className="object-cover"
        />
        {isCover && (
          <Badge className="absolute left-2 top-2 gap-1">
            <Star className="size-3" /> 封面
          </Badge>
        )}

        {/* 拖拽手柄（常驻显示） */}
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="absolute bottom-2 left-2 flex size-7 cursor-grab touch-none items-center justify-center rounded-md bg-black/55 text-white transition-colors hover:bg-black/75 active:cursor-grabbing"
          aria-label="拖拽排序"
          title="拖拽调整顺序"
        >
          <GripVertical className="size-4" />
        </button>

        {/* 操作按钮（常驻显示） */}
        <div className="absolute right-2 top-2 flex gap-1">
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="size-7 shadow-sm"
            title={isCover ? "当前封面" : "设为封面"}
            aria-label={isCover ? "当前封面" : "设为封面"}
            disabled={isCover}
            onClick={() => onSetCover(photo)}
          >
            <Star
              className={
                isCover ? "size-4 fill-primary text-primary" : "size-4"
              }
            />
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="size-7 shadow-sm"
            title="删除照片"
            aria-label="删除照片"
            onClick={() => onDelete(photo)}
          >
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </div>
      </div>

      {/* 图注（点击编辑） */}
      <button
        type="button"
        onClick={() => onEditCaption(photo)}
        className="flex w-full items-center gap-1 p-2 text-left text-xs text-muted-foreground hover:text-foreground"
        title="点击编辑图注"
      >
        <Pencil className="size-3 shrink-0" />
        <span className="truncate">{photo.caption || "添加图注"}</span>
      </button>
    </div>
  );
}

// ── 相册照片管理页 ─────────────────────────────────────

export default function AlbumDetailPage() {
  const router = useRouter();
  const { token } = useAuth();
  const { slug } = useParams<{ slug: string }>();

  const [album, setAlbum] = useState<AlbumDetail | null>(null);
  const [photos, setPhotos] = useState<AlbumPhotoPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [editInfoOpen, setEditInfoOpen] = useState(false);
  const [captionTarget, setCaptionTarget] = useState<AlbumPhotoPublic | null>(
    null
  );
  const [captionText, setCaptionText] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<AlbumPhotoPublic | null>(
    null
  );
  const inputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  useEffect(() => {
    if (!token) return;
    let active = true;
    (async () => {
      try {
        const data = await getAlbumBySlug(token, slug);
        if (active) {
          setAlbum(data);
          setPhotos(data.photos);
        }
      } catch (err) {
        if (active) {
          toast.error(errorMessage(err, "加载相册失败"));
          router.push("/admin/albums");
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [token, slug, router]);

  const pick = () => inputRef.current?.click();

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0 || !token || !album) return;
    setUploading(true);
    try {
      let order = photos.length;
      const added: AlbumPhotoPublic[] = [];
      for (const file of Array.from(files)) {
        const media = await uploadMedia(token, file, "album");
        const photo = await addAlbumPhoto(token, album.id, {
          media_id: media.id,
          sort_order: order++,
        });
        added.push(photo);
      }
      setPhotos((prev) => [...prev, ...added]);
      toast.success(`已添加 ${added.length} 张照片`);
    } catch (err) {
      toast.error(errorMessage(err, "上传失败"));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !token || !album) return;

    const oldIndex = photos.findIndex((p) => p.id === active.id);
    const newIndex = photos.findIndex((p) => p.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const reordered = arrayMove(photos, oldIndex, newIndex);
    const prev = photos;
    setPhotos(reordered); // 乐观更新

    // 仅持久化 sort_order 变化的照片
    const changed = reordered
      .map((p, idx) => ({ p, idx }))
      .filter(({ p, idx }) => p.sort_order !== idx);
    try {
      await Promise.all(
        changed.map(({ p, idx }) =>
          updateAlbumPhoto(token, album.id, p.id, { sort_order: idx })
        )
      );
      setPhotos((cur) => cur.map((p, idx) => ({ ...p, sort_order: idx })));
    } catch (err) {
      toast.error(errorMessage(err, "排序保存失败"));
      setPhotos(prev); // 回滚
    }
  };

  const openCaption = (photo: AlbumPhotoPublic) => {
    setCaptionTarget(photo);
    setCaptionText(photo.caption || "");
  };

  const saveCaption = async () => {
    if (!captionTarget || !token || !album) return;
    try {
      const updated = await updateAlbumPhoto(
        token,
        album.id,
        captionTarget.id,
        { caption: captionText || null }
      );
      setPhotos((prev) =>
        prev.map((p) => (p.id === updated.id ? { ...p, caption: updated.caption } : p))
      );
      setCaptionTarget(null);
      toast.success("已保存");
    } catch (err) {
      toast.error(errorMessage(err, "保存失败"));
    }
  };

  const setCover = async (photo: AlbumPhotoPublic) => {
    if (!token || !album) return;
    try {
      const updated = await updateAlbum(token, album.id, {
        cover_media_id: photo.media_id,
      });
      setAlbum(updated);
      toast.success("已设为封面");
    } catch (err) {
      toast.error(errorMessage(err, "设置封面失败"));
    }
  };

  const handleDeletePhoto = async () => {
    if (!deleteTarget || !token || !album) return;
    try {
      await deleteAlbumPhoto(token, album.id, deleteTarget.id);
      // 若删的正是封面，连带清空封面
      if (album.cover_media_id === deleteTarget.media_id) {
        const updated = await updateAlbum(token, album.id, {
          cover_media_id: null,
        });
        setAlbum(updated);
      }
      setPhotos((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast.success("已删除");
    } catch (err) {
      toast.error(errorMessage(err, "删除失败"));
    }
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        加载中...
      </div>
    );
  }

  if (!album) return null;

  return (
    <div className="flex flex-1 flex-col space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <SidebarTrigger className="-ml-1" />
          <Button
            variant="ghost"
            size="icon"
            aria-label="返回相册列表"
            nativeButton={false}
            render={<Link href="/admin/albums" />}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <h1 className="truncate text-2xl font-bold" title={album.title}>
            {album.title}
          </h1>
          {!album.is_public && (
            <Badge variant="secondary" className="gap-1">
              <Lock className="size-3" /> 私密
            </Badge>
          )}
          <span className="shrink-0 text-sm text-muted-foreground">
            {photos.length} 张
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setEditInfoOpen(true)}
        >
          <Pencil className="size-4" /> 编辑信息
        </Button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {/* 上传区 */}
        <button
          type="button"
          onClick={pick}
          disabled={uploading}
          className="flex aspect-square flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-50"
        >
          {uploading ? (
            <>
              <Loader2 className="size-6 animate-spin" />
              <span className="text-xs">上传中...</span>
            </>
          ) : (
            <>
              <ImagePlus className="size-6" />
              <span className="text-xs">上传照片</span>
            </>
          )}
        </button>

        {/* 可拖拽照片 */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={photos.map((p) => p.id)}
            strategy={rectSortingStrategy}
          >
            {photos.map((photo) => (
              <SortablePhoto
                key={photo.id}
                photo={photo}
                isCover={album.cover_media_id === photo.media_id}
                onEditCaption={openCaption}
                onSetCover={setCover}
                onDelete={setDeleteTarget}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>

      {/* 编辑相册信息 */}
      <AlbumFormDialog
        open={editInfoOpen}
        onOpenChange={setEditInfoOpen}
        album={album}
        onSaved={(saved) => setAlbum((cur) => ({ ...saved, photos: cur?.photos ?? photos }))}
      />

      {/* 图注编辑 */}
      <Dialog
        open={!!captionTarget}
        onOpenChange={(open) => !open && setCaptionTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑图注</DialogTitle>
            <DialogDescription className="sr-only">
              修改这张照片的说明文字
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="caption">图注</Label>
            <Input
              id="caption"
              value={captionText}
              onChange={(e) => setCaptionText(e.target.value)}
              placeholder="给这张照片写点说明"
              onKeyDown={(e) => {
                if (e.key === "Enter") saveCaption();
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCaptionTarget(null)}>
              取消
            </Button>
            <Button onClick={saveCaption}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除照片确认 */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除照片</DialogTitle>
            <DialogDescription>
              从相册中移除这张照片（原始文件保留在媒体库）。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleDeletePhoto}>
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
