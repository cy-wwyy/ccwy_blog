"use client";

import { useEffect } from "react";
import { useForm, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SlugInput, useAutoFillSlug } from "@/components/admin/slug-input";
import { SLUG_PATTERN } from "@/lib/constants";
import {
  createAlbum,
  updateAlbum,
  type AlbumPublic,
  type AlbumDetail,
} from "@/lib/api";

const albumSchema = z.object({
  title: z.string().min(1, "请输入标题"),
  slug: z
    .string()
    .regex(SLUG_PATTERN, "slug 只能包含小写字母、数字和连字符"),
  description: z.string(),
  isPublic: z.string(),
});

type AlbumFormValues = z.infer<typeof albumSchema>;

const VISIBILITY_ITEMS = [
  { label: "公开", value: "true" },
  { label: "私密", value: "false" },
];

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

interface AlbumFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 传入则为编辑，null 为新建 */
  album: AlbumPublic | null;
  onSaved: (album: AlbumDetail) => void;
}

export function AlbumFormDialog({
  open,
  onOpenChange,
  album,
  onSaved,
}: AlbumFormDialogProps) {
  const { token } = useAuth();
  const maybeFillSlug = useAutoFillSlug(token);
  const {
    register,
    handleSubmit,
    control,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<AlbumFormValues>({
    resolver: zodResolver(albumSchema),
    defaultValues: { title: "", slug: "", description: "", isPublic: "true" },
  });

  const title = useWatch({ control, name: "title" });

  // 打开时按当前 album 填充表单
  useEffect(() => {
    if (!open) return;
    reset({
      title: album?.title ?? "",
      slug: album?.slug ?? "",
      description: album?.description ?? "",
      isPublic: album ? (album.is_public ? "true" : "false") : "true",
    });
  }, [open, album, reset]);

  const onSubmit = async (values: AlbumFormValues) => {
    if (!token) return;
    const slug = await maybeFillSlug(values.title, values.slug);
    if (!slug.trim()) {
      setError("slug", { message: "请输入 slug 或点击 ✨ 自动生成" });
      return;
    }
    const payload = {
      title: values.title,
      slug,
      description: values.description || null,
      is_public: values.isPublic === "true",
    };
    try {
      const saved = album
        ? await updateAlbum(token, album.id, payload)
        : await createAlbum(token, payload);
      toast.success(album ? "已保存" : "已创建");
      onOpenChange(false);
      onSaved(saved);
    } catch (err) {
      toast.error(errorMessage(err, "保存失败"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{album ? "编辑相册" : "新建相册"}</DialogTitle>
          <DialogDescription className="sr-only">
            填写相册标题、slug 与可见性
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="album-title">标题</Label>
              <Input
                id="album-title"
                {...register("title")}
                placeholder="相册标题"
                aria-invalid={!!errors.title}
              />
              {errors.title && (
                <p className="text-sm text-destructive">
                  {errors.title.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="album-slug">slug</Label>
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
              <Label htmlFor="album-desc">描述（可选）</Label>
              <Textarea
                id="album-desc"
                {...register("description")}
                placeholder="相册描述"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>可见性</Label>
              <Controller
                control={control}
                name="isPublic"
                render={({ field }) => (
                  <Select
                    items={VISIBILITY_ITEMS}
                    value={field.value}
                    onValueChange={(val) => field.onChange(val ?? "true")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {VISIBILITY_ITEMS.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              取消
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              保存
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
