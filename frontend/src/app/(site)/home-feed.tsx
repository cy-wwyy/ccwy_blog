"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PostCard } from "@/components/site/post-card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchPublicPosts,
  fetchPublicCategories,
  type PostPublic,
  type CategoryPublic,
} from "@/lib/api";

export function HomeFeed() {
  const [posts, setPosts] = useState<PostPublic[] | null>(null);
  const [categories, setCategories] = useState<CategoryPublic[]>([]);

  useEffect(() => {
    fetchPublicCategories()
      .then(setCategories)
      .catch(() => {});
  }, []);

  const catNameMap = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c.name])),
    [categories]
  );

  useEffect(() => {
    let active = true;
    fetchPublicPosts({ limit: 6 })
      .then((r) => {
        if (active) setPosts(r.data);
      })
      .catch(() => {
        if (active) setPosts([]);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="pb-8">
      <div className="flex items-center justify-between mb-4 px-4">
        <h2 className="text-sm font-semibold text-muted-foreground">最新文章</h2>
        <Link
          href="/blog"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
        >
          查看全部 <ArrowRight size={12} />
        </Link>
      </div>

      {posts === null ? (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="w-[90%] mx-auto h-[120px] rounded-xl" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <p className="text-muted-foreground text-center py-20">暂无文章</p>
      ) : (
        <div className="flex flex-col gap-4">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              categoryName={post.category_id ? catNameMap[post.category_id] : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
