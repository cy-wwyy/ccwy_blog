"use client";

import { useMemo } from "react";
import { useForm, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MdEditor } from "@/components/editor/md-editor";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { CoverUpload } from "@/components/admin/cover-upload";
import { SlugInput, useAutoFillSlug } from "@/components/admin/slug-input";
import { useAuth } from "@/hooks/use-auth";
import { POST_STATUS, SLUG_PATTERN, type PostStatus } from "@/lib/constants";
import type { CategoryPublic, TagPublic } from "@/lib/api";

const postSchema = z.object({
  title: z.string().min(1, "请输入标题"),
  slug: z
    .string()
    .min(1, "请输入 slug")
    .regex(SLUG_PATTERN, "slug 只能包含小写字母、数字和连字符"),
  excerpt: z.string(),
  cover: z.string(),
  content: z.string(),
  categoryId: z.string(),
  tagIds: z.array(z.string()),
});

export type PostFormValues = z.infer<typeof postSchema>;

interface PostFormProps {
  heading: string;
  initial?: Partial<PostFormValues>;
  categories: CategoryPublic[];
  tags: TagPublic[];
  saving: boolean;
  onBack: () => void;
  onSave: (values: PostFormValues, status: PostStatus) => void;
}

// 扁平化分类树：DFS 顺序 + 深度 + 是否末级，用于下拉的层级缩进展示
interface CatOption {
  id: string;
  name: string;
  depth: number;
  isLeaf: boolean;
}

function flattenCategories(cats: CategoryPublic[]): CatOption[] {
  const ids = new Set(cats.map((c) => c.id));
  const childrenOf = new Map<string, CategoryPublic[]>();
  for (const c of cats) {
    const key = c.parent_id && ids.has(c.parent_id) ? c.parent_id : "";
    if (!childrenOf.has(key)) childrenOf.set(key, []);
    childrenOf.get(key)!.push(c);
  }
  childrenOf.forEach((arr) => arr.sort((a, b) => a.sort_order - b.sort_order));
  const out: CatOption[] = [];
  const walk = (parentKey: string, depth: number) => {
    for (const c of childrenOf.get(parentKey) ?? []) {
      const isLeaf = (childrenOf.get(c.id) ?? []).length === 0;
      out.push({ id: c.id, name: c.name, depth, isLeaf });
      walk(c.id, depth + 1);
    }
  };
  walk("", 0);
  return out;
}

export function PostForm({
  heading,
  initial,
  categories,
  tags,
  saving,
  onBack,
  onSave,
}: PostFormProps) {
  const { token } = useAuth();
  const maybeFillSlug = useAutoFillSlug(token);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<PostFormValues>({
    resolver: zodResolver(postSchema),
    defaultValues: {
      title: initial?.title ?? "",
      slug: initial?.slug ?? "",
      excerpt: initial?.excerpt ?? "",
      cover: initial?.cover ?? "",
      content: initial?.content ?? "",
      categoryId: initial?.categoryId ?? "",
      tagIds: initial?.tagIds ?? [],
    },
  });

  const title = useWatch({ control, name: "title" });

  const categoryItems = useMemo(
    () => [
      { label: "无", value: "" },
      ...categories.map((c) => ({ label: c.name, value: c.id })),
    ],
    [categories]
  );

  // 按层级缩进展示；父级（非末级）可见但禁用，只能选末级分类
  const categoryOptions = useMemo(
    () => flattenCategories(categories),
    [categories]
  );

  // 两个提交入口共用校验；校验通过后按对应状态回调
  const submit = (status: PostStatus) =>
    handleSubmit(async (values) => {
      const slug = await maybeFillSlug(values.title, values.slug);
      onSave({ ...values, slug }, status);
    });

  return (
    <div className="flex flex-1 flex-col space-y-2">
      <div className="flex items-center gap-2 shrink-0">
        <SidebarTrigger className="-ml-1" />
        <Button variant="ghost" size="icon" aria-label="返回" onClick={onBack}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-2xl font-bold">{heading}</h1>
      </div>

      <div className="grid grid-cols-[minmax(384px,1fr)_256px] gap-6">
        {/* 左侧 */}
        <div className="flex flex-col gap-4">
          <div className="space-y-1">
            <Input
              {...register("title")}
              placeholder="文章标题"
              aria-invalid={!!errors.title}
              className="text-lg font-medium"
            />
            {errors.title && (
              <p className="text-sm text-destructive">{errors.title.message}</p>
            )}
          </div>
          <Controller
            control={control}
            name="content"
            render={({ field }) => (
              <MdEditor value={field.value} onChange={field.onChange} />
            )}
          />
        </div>

        {/* 右侧 */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="slug">slug</Label>
            <Controller
              control={control}
              name="slug"
              render={({ field }) => (
                <SlugInput
                  value={field.value}
                  onChange={field.onChange}
                  title={title}
                  error={errors.slug?.message}
                />
              )}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="excerpt">摘要</Label>
            <Input
              id="excerpt"
              {...register("excerpt")}
              placeholder="简短摘要（可选）"
            />
          </div>
          <div className="space-y-2">
            <Label>封面</Label>
            <Controller
              control={control}
              name="cover"
              render={({ field }) => (
                <CoverUpload value={field.value} onChange={field.onChange} />
              )}
            />
          </div>
          <div className="space-y-2">
            <Label>分类</Label>
            <Controller
              control={control}
              name="categoryId"
              render={({ field }) => (
                <Select
                  items={categoryItems}
                  value={field.value}
                  onValueChange={(val) => field.onChange(val ?? "")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">无</SelectItem>
                    {categoryOptions.map((opt) => (
                      <SelectItem
                        key={opt.id}
                        value={opt.id}
                        disabled={!opt.isLeaf}
                        style={{ paddingLeft: `${6 + opt.depth * 16}px` }}
                        className={opt.isLeaf ? undefined : "font-medium"}
                      >
                        {opt.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="space-y-2">
            <Label>标签</Label>
            <Controller
              control={control}
              name="tagIds"
              render={({ field }) => (
                <div className="flex flex-wrap gap-1">
                  {tags.map((t) => {
                    const active = field.value.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        aria-pressed={active}
                        className={
                          "rounded-full px-2.5 py-0.5 text-xs border transition-colors " +
                          (active
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-transparent hover:bg-muted border-input")
                        }
                        onClick={() =>
                          field.onChange(
                            active
                              ? field.value.filter((x) => x !== t.id)
                              : [...field.value, t.id]
                          )
                        }
                      >
                        {t.name}
                      </button>
                    );
                  })}
                </div>
              )}
            />
          </div>

          <div className="flex gap-2 pt-4">
            <Button
              variant="outline"
              className="flex-1"
              disabled={saving}
              onClick={submit(POST_STATUS.DRAFT)}
            >
              保存草稿
            </Button>
            <Button
              className="flex-1"
              disabled={saving}
              onClick={submit(POST_STATUS.PUBLISHED)}
            >
              发布
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
