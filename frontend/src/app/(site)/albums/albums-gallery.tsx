"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Camera, Eye } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchPublicAlbums, type PublicAlbumCard } from "@/lib/api";

// 瀑布流骨架 —— 列优先、高度错落，贴近真实布局
const SKELETON_HEIGHTS = [180, 140, 220, 160, 200, 150];

function GallerySkeleton() {
  return (
    <div className="columns-2 gap-3 px-4 lg:columns-3 [&>*]:mb-3">
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

export function AlbumsGallery() {
  const [albums, setAlbums] = useState<PublicAlbumCard[] | null>(null);

  useEffect(() => {
    let active = true;
    fetchPublicAlbums({ limit: 100 })
      .then((r) => {
        if (active) setAlbums(r.data);
      })
      .catch(() => {
        if (active) setAlbums([]);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="pb-8">
      <div className="mb-4 flex items-center justify-between px-4">
        <h2 className="text-sm font-semibold text-muted-foreground">相册</h2>
      </div>

      {albums === null ? (
        <GallerySkeleton />
      ) : albums.length === 0 ? (
        <p className="py-20 text-center text-muted-foreground">暂无相册</p>
      ) : (
        <div className="columns-2 gap-3 px-4 lg:columns-3 [&>*]:mb-3">
          {albums.map((album) => (
            <Link
              key={album.id}
              href={`/albums/${album.slug}`}
              className="group block break-inside-avoid overflow-hidden rounded-xl border border-border/50 bg-card/80 backdrop-blur-md transition-shadow hover:border-border hover:shadow-lg"
            >
              {album.cover_url ? (
                // 瀑布流按图片原始比例自适应，用原生 img 让高度随宽度自然缩放
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={album.cover_url}
                  alt={album.title}
                  className="h-auto w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              ) : (
                <div className="flex aspect-[4/3] items-center justify-center bg-muted text-muted-foreground">
                  <Camera className="size-7" />
                </div>
              )}
              <div className="p-3">
                <p className="truncate text-sm font-semibold">{album.title}</p>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{album.photo_count} 张照片</span>
                  <span className="inline-flex items-center gap-1">
                    <Eye size={12} />
                    {album.views}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
