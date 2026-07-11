"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { PostForm, type PostFormValues } from "@/components/admin/post-form";
import type { PostStatus } from "@/lib/constants";
import {
  fetchCategories,
  fetchTags,
  createPost,
  type CategoryPublic,
  type TagPublic,
} from "@/lib/api";

export default function NewPostPage() {
  const router = useRouter();
  const { token } = useAuth();
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<CategoryPublic[]>([]);
  const [tags, setTags] = useState<TagPublic[]>([]);

  useEffect(() => {
    if (!token) return;
    Promise.all([fetchCategories(token), fetchTags(token)])
      .then(([cats, tgs]) => {
        setCategories(cats);
        setTags(tgs);
      })
      .catch((err) =>
        toast.error(err instanceof Error ? err.message : "加载数据失败")
      );
  }, [token]);

  const handleSave = async (values: PostFormValues, status: PostStatus) => {
    if (!token) return;
    setSaving(true);
    try {
      await createPost(token, {
        title: values.title,
        slug: values.slug,
        content: values.content,
        excerpt: values.excerpt || null,
        cover: values.cover || null,
        status,
        category_id: values.categoryId || null,
        tag_ids: values.tagIds,
      });
      toast.success("文章已创建");
      router.push("/admin/posts");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PostForm
      heading="新建文章"
      categories={categories}
      tags={tags}
      saving={saving}
      onBack={() => router.back()}
      onSave={handleSave}
    />
  );
}
