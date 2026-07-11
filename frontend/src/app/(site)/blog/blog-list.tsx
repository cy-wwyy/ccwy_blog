"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PostCard } from "@/components/site/post-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  fetchPublicPosts,
  fetchPublicCategories,
  type PostPublic,
  type CategoryPublic,
} from "@/lib/api";

const PAGE_SIZE = 10;

function ResultsSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="w-[90%] mx-auto h-[120px] rounded-xl" />
      ))}
    </div>
  );
}

export function BlogList() {
  const searchParams = useSearchParams();
  const categorySlug = searchParams.get("category") ?? "";
  const search = searchParams.get("search") ?? "";
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
  const activeCategory = categories.find((c) => c.slug === categorySlug);
  const heading = search
    ? `搜索：${search}`
    : activeCategory
      ? activeCategory.name
      : "全部文章";

  // 带分类筛选但分类尚未加载 → 先等，避免误拉全量
  const waitingCategory = categorySlug !== "" && categories.length === 0;

  return (
    <div className="pb-8">
      <div className="flex items-center justify-between mb-4 px-4">
        <h2 className="text-sm font-semibold text-muted-foreground">{heading}</h2>
      </div>
      {waitingCategory ? (
        <ResultsSkeleton />
      ) : (
        // key 变化时重挂载 → 切换分类/搜索自动回到第 1 页
        <BlogResults
          key={`${categorySlug}|${search}`}
          categoryId={activeCategory?.id}
          search={search || undefined}
          catNameMap={catNameMap}
        />
      )}
    </div>
  );
}

function BlogResults({
  categoryId,
  search,
  catNameMap,
}: {
  categoryId?: string;
  search?: string;
  catNameMap: Record<string, string>;
}) {
  const [page, setPage] = useState(1);
  const [posts, setPosts] = useState<PostPublic[] | null>(null);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let active = true;
    fetchPublicPosts({
      skip: (page - 1) * PAGE_SIZE,
      limit: PAGE_SIZE,
      category_id: categoryId,
      search,
    })
      .then((r) => {
        if (active) {
          setPosts(r.data);
          setTotal(r.count);
        }
      })
      .catch(() => {
        if (active) {
          setPosts([]);
          setTotal(0);
        }
      });
    return () => {
      active = false;
    };
  }, [page, categoryId, search]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (posts === null) return <ResultsSkeleton />;
  if (posts.length === 0) {
    return (
      <p className="text-muted-foreground text-center py-20">没有找到文章</p>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        {posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            categoryName={
              post.category_id ? catNameMap[post.category_id] : undefined
            }
          />
        ))}
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 mt-8 text-sm">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            <ChevronLeft className="size-4" /> 上一页
          </Button>
          <span className="text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            下一页 <ChevronRight className="size-4" />
          </Button>
        </div>
      )}
    </>
  );
}
