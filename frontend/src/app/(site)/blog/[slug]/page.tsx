"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Clock, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { VditorPreview } from "@/components/editor/vditor-preview";
import { fetchPublicPost, trackView, type PostDetail } from "@/lib/api";
import { formatDate } from "@/lib/utils";

export default function PostDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [post, setPost] = useState<PostDetail | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let active = true;
    fetchPublicPost(slug)
      .then((p) => {
        if (active) setPost(p);
      })
      .catch(() => {
        if (active) setNotFound(true);
      });
    trackView("post", slug); // 文章浏览量（半小时去重）埋点
    return () => {
      active = false;
    };
  }, [slug]);

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center gap-3">
        <h1 className="text-lg font-semibold">文章不存在</h1>
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowLeft size={14} /> 返回首页
        </Link>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-4">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <article className="max-w-3xl mx-auto px-4 py-8">
      <Link
        href="/"
        className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-6"
      >
        <ArrowLeft size={13} /> 返回首页
      </Link>

      <h1 className="text-2xl font-bold leading-tight mb-3">{post.title}</h1>

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mb-8">
        <span className="inline-flex items-center gap-1">
          <Clock size={13} />
          {formatDate(post.published_at ?? post.created_at ?? "")}
        </span>
        <span className="inline-flex items-center gap-1">
          <Eye size={13} />
          {post.views} 次浏览
        </span>
        {post.category && <span>{post.category.name}</span>}
        {post.tags.map((t) => (
          <Badge key={t.id} variant="outline" className="text-[11px]">
            {t.name}
          </Badge>
        ))}
      </div>

      <VditorPreview content={post.content} />
    </article>
  );
}
