"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, ExternalLink, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { fetchAdminMedia, type MediaUploadResult } from "@/lib/api";

const PAGE_SIZE = 24;

const MODULES = [
  { value: "", label: "全部" },
  { value: "blog", label: "文章" },
  { value: "album", label: "相册" },
  { value: "avatar", label: "头像" },
  { value: "media", label: "其他" },
];

function formatSize(bytes: number): string {
  if (!bytes) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function isImage(mime: string) {
  return mime.startsWith("image/");
}

export default function MediaPage() {
  const { token } = useAuth();
  const [items, setItems] = useState<MediaUploadResult[] | null>(null);
  const [total, setTotal] = useState(0);
  const [module, setModule] = useState("");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<MediaUploadResult | null>(null);
  const [copied, setCopied] = useState(false);

  // 筛选变化时回到第 1 页
  const changeModule = (m: string) => {
    setModule(m);
    setPage(0);
  };

  const load = useCallback(() => {
    if (!token) return;
    let active = true;
    setLoading(true);
    fetchAdminMedia(token, {
      skip: page * PAGE_SIZE,
      limit: PAGE_SIZE,
      module: module || undefined,
    })
      .then((res) => {
        if (!active) return;
        setItems(res.data);
        setTotal(res.count);
      })
      .catch((e) => {
        if (!active) return;
        setItems([]);
        toast.error(e instanceof Error ? e.message : "加载媒体库失败");
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [token, page, module]);

  useEffect(() => load(), [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("链接已复制");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("复制失败，请手动选择");
    }
  };

  const moduleLabel = useMemo(
    () => Object.fromEntries(MODULES.map((m) => [m.value, m.label])),
    []
  );

  return (
    <div className="flex flex-1 flex-col space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1>媒体库</h1>
          {total > 0 && (
            <span className="text-[12.5px] text-muted-foreground">
              共 {total} 个文件
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {MODULES.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => changeModule(m.value)}
              className={[
                "h-9 rounded-[10px] px-3 text-[13px] font-semibold transition-colors",
                module === m.value
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              ].join(" ")}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-[18px]" />
          ))}
        </div>
      ) : !items || items.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          {module ? "该分类下还没有文件" : "还没有媒体文件，去文章或相册里上传试试"}
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {items.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setPreview(m)}
              className="group relative aspect-square overflow-hidden rounded-[18px] border border-border bg-secondary text-left transition-shadow hover:shadow-md"
            >
              {isImage(m.mime_type) ? (
                // 用原生 img：这些是后端直出的静态资源，域名可能随时变，不适合 next/image 固定域
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={m.thumb_url || m.url}
                  alt={m.filename}
                  loading="lazy"
                  className="size-full object-cover transition-transform group-hover:scale-[1.03]"
                />
              ) : (
                <span className="flex size-full items-center justify-center text-muted-foreground">
                  <FileText className="size-6" />
                </span>
              )}
              <span className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/65 to-transparent px-2 py-1.5 text-[10.5px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                <span className="truncate">{m.filename}</span>
                <span className="shrink-0 tabular-nums">{formatSize(m.size)}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            上一页
          </Button>
          <span className="text-[12.5px] text-muted-foreground">
            {page + 1} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page + 1 >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            下一页
          </Button>
        </div>
      )}

      <Dialog
        open={!!preview}
        onOpenChange={(open) => !open && setPreview(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="truncate">{preview?.filename}</DialogTitle>
            <DialogDescription className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                {moduleLabel[preview?.module ?? ""] ?? preview?.module}
              </Badge>
              <span>{preview?.mime_type}</span>
              <span className="tabular-nums">{formatSize(preview?.size ?? 0)}</span>
              {preview?.synced_to_oss && <span>已同步 OSS</span>}
            </DialogDescription>
          </DialogHeader>

          {preview && isImage(preview.mime_type) && (
            <div className="max-h-[52vh] overflow-auto rounded-xl bg-secondary p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview.url}
                alt={preview.filename}
                className="mx-auto max-h-[48vh] w-auto object-contain"
              />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-secondary px-2.5 py-1.5 text-[12px]">
              {preview?.url}
            </code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => preview && copyUrl(preview.url)}
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              复制链接
            </Button>
            {preview && (
              <Button variant="ghost" size="sm" onClick={() => window.open(preview.url, "_blank")}>
                <ExternalLink className="size-3.5" />
                打开原图
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
