"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { PostForm, type PostFormValues } from "@/components/admin/post-form";
import { Button } from "@/components/ui/button";
import type { PostStatus } from "@/lib/constants";
import {
  fetchCategories,
  fetchTags,
  getPostBySlug,
  updatePost,
  type CategoryPublic,
  type TagPublic,
} from "@/lib/api";

export default function EditPostPage() {
  const router = useRouter();
  const { token } = useAuth();
  const { slug } = useParams<{ slug: string }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<CategoryPublic[]>([]);
  const [tags, setTags] = useState<TagPublic[]>([]);
  const [initial, setInitial] = useState<PostFormValues | null>(null);
  // 路由用 slug 展示，但更新仍需文章 id
  const [postId, setPostId] = useState<string | null>(null);
  // 加载失败要给出明确错误页，否则 initial 永远为 null、页面卡在"加载中..."
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let active = true;
    setLoadError(null);
    setLoading(true);
    // 文章本体必须成功；分类/标签属于辅助数据，失败不应阻塞编辑
    Promise.allSettled([
      fetchCategories(token),
      fetchTags(token),
      getPostBySlug(token, slug),
    ])
      .then(([catsRes, tagsRes, postRes]) => {
        if (!active) return;
        if (catsRes.status === "fulfilled") setCategories(catsRes.value);
        else toast.error("分类加载失败，可先保存文章");
        if (tagsRes.status === "fulfilled") setTags(tagsRes.value);
        else toast.error("标签加载失败，可先保存文章");

        if (postRes.status === "rejected") {
          const msg =
            postRes.reason instanceof Error
              ? postRes.reason.message
              : "加载文章失败";
          setLoadError(msg);
          return;
        }
        const post = postRes.value;
        setPostId(post.id);
        setInitial({
          title: post.title,
          slug: post.slug,
          excerpt: post.excerpt || "",
          cover: post.cover || "",
          content: post.content,
          categoryId: post.category_id || "",
          tagIds: post.tags?.map((t: TagPublic) => t.id) || [],
        });
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [slug, token]);

  const handleSave = async (values: PostFormValues, status: PostStatus) => {
    if (!token || !postId) return;
    setSaving(true);
    try {
      await updatePost(token, postId, {
        title: values.title,
        slug: values.slug,
        content: values.content,
        excerpt: values.excerpt || null,
        cover: values.cover || null,
        status,
        category_id: values.categoryId || null,
        tag_ids: values.tagIds,
      });
      toast.success("已保存");
      router.push("/admin/posts");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">加载中...</div>;
  }

  if (loadError || !initial) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 h-64">
        <p className="text-sm text-muted-foreground">
          {loadError || "文章不存在或已被删除"}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.refresh()}>
            重试
          </Button>
          <Button onClick={() => router.push("/admin/posts")}>返回列表</Button>
        </div>
      </div>
    );
  }

  return (
    <PostForm
      heading="编辑文章"
      initial={initial}
      categories={categories}
      tags={tags}
      saving={saving}
      onBack={() => router.push("/admin/posts")}
      onSave={handleSave}
    />
  );
}
