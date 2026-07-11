"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { PostForm, type PostFormValues } from "@/components/admin/post-form";
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

  useEffect(() => {
    if (!token) return;
    Promise.all([
      fetchCategories(token),
      fetchTags(token),
      getPostBySlug(token, slug),
    ])
      .then(([cats, tgs, post]) => {
        setCategories(cats);
        setTags(tgs);
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
      .catch((err) =>
        toast.error(err instanceof Error ? err.message : "加载文章失败")
      )
      .finally(() => setLoading(false));
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

  if (loading || !initial) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">加载中...</div>;
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
