"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  fetchPublicAlbum,
  type AlbumDetail,
  type AlbumPhotoPublic,
} from "@/lib/api";

const SKELETON_HEIGHTS = [200, 150, 240, 170, 210, 160, 190, 140];

function GallerySkeleton() {
  return (
    <div className="columns-2 gap-3 lg:columns-3 [&>*]:mb-3">
      {SKELETON_HEIGHTS.map((h, i) => (
        <Skeleton
          key={i}
          className="w-full break-inside-avoid rounded-xl"
          style={{ height: h }}
        />
      ))}
    </div>
  );
}

export default function AlbumDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [album, setAlbum] = useState<AlbumDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [lightbox, setLightbox] = useState<AlbumPhotoPublic | null>(null);

  useEffect(() => {
    let active = true;
    fetchPublicAlbum(slug)
      .then((a) => {
        if (active) setAlbum(a);
      })
      .catch(() => {
        if (active) setNotFound(true);
      });
    return () => {
      active = false;
    };
  }, [slug]);

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-32 text-center">
        <h1 className="text-lg font-semibold">相册不存在</h1>
        <Link
          href="/albums"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={14} /> 返回相册
        </Link>
      </div>
    );
  }

  return (
    <div className="px-4 pb-8">
      <div className="mb-4 flex items-center gap-2">
        <Link
          href="/albums"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={14} /> 相册
        </Link>
        {album && (
          <>
            <span className="text-muted-foreground/40">/</span>
            <h1 className="truncate text-sm font-semibold">{album.title}</h1>
            <span className="shrink-0 text-xs text-muted-foreground">
              {album.photos.length} 张
            </span>
          </>
        )}
      </div>

      {album?.description && (
        <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
          {album.description}
        </p>
      )}

      {!album ? (
        <GallerySkeleton />
      ) : album.photos.length === 0 ? (
        <p className="py-20 text-center text-muted-foreground">相册暂无照片</p>
      ) : (
        <div className="columns-2 gap-3 lg:columns-3 [&>*]:mb-3">
          {album.photos.map((photo) => (
            <button
              key={photo.id}
              type="button"
              onClick={() => setLightbox(photo)}
              className="group block w-full cursor-zoom-in break-inside-avoid overflow-hidden rounded-xl border border-border/50 bg-card/80 backdrop-blur-md transition-shadow hover:border-border hover:shadow-lg"
            >
              {/* 瀑布流按原始比例自适应，用原生 img 让高度随宽度自然缩放 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.thumb_url || photo.url}
                alt={photo.caption || "照片"}
                className="h-auto w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              {photo.caption && (
                <p className="truncate px-3 py-2 text-left text-xs text-muted-foreground">
                  {photo.caption}
                </p>
              )}
            </button>
          ))}
        </div>
      )}

      {/* 原图灯箱 —— 盒子贴合图片原始比例 */}
      <Dialog
        open={!!lightbox}
        onOpenChange={(open) => !open && setLightbox(null)}
      >
        <DialogContent
          className="w-fit max-w-[95vw] justify-items-center gap-2 border-none bg-transparent p-0 shadow-none ring-0 sm:max-w-[95vw]"
          showCloseButton={false}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>{lightbox?.caption || "查看原图"}</DialogTitle>
            <DialogDescription>相册照片原图预览</DialogDescription>
          </DialogHeader>
          {lightbox && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={lightbox.url}
                alt={lightbox.caption || "原图"}
                className="max-h-[85vh] max-w-[95vw] rounded-lg object-contain"
              />
              {lightbox.caption && (
                <p className="max-w-[95vw] truncate text-center text-sm text-white/90">
                  {lightbox.caption}
                </p>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
