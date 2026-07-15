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
import { createTrip, updateTrip, type TripPublic } from "@/lib/api";

const tripSchema = z.object({
  title: z.string().min(1, "请输入标题"),
  slug: z.string().regex(SLUG_PATTERN, "slug 只能包含小写字母、数字和连字符"),
  description: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  isPublic: z.string(),
  status: z.string(),
});

type TripFormValues = z.infer<typeof tripSchema>;

const VISIBILITY_ITEMS = [
  { label: "公开", value: "true" },
  { label: "私密", value: "false" },
];
const STATUS_ITEMS = [
  { label: "已发布", value: "published" },
  { label: "草稿", value: "draft" },
];

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

interface TripFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trip: TripPublic | null;
  onSaved: () => void;
}

export function AdminTripFormDialog({
  open,
  onOpenChange,
  trip,
  onSaved,
}: TripFormDialogProps) {
  const { token } = useAuth();
  const maybeFillSlug = useAutoFillSlug(token);
  const {
    register,
    handleSubmit,
    control,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<TripFormValues>({
    resolver: zodResolver(tripSchema),
    defaultValues: {
      title: "", slug: "", description: "",
      startDate: "", endDate: "",
      isPublic: "true", status: "draft",
    },
  });

  const title = useWatch({ control, name: "title" });

  useEffect(() => {
    if (!open) return;
    reset({
      title: trip?.title ?? "",
      slug: trip?.slug ?? "",
      description: trip?.description ?? "",
      startDate: trip?.start_date ?? "",
      endDate: trip?.end_date ?? "",
      isPublic: trip ? (trip.is_public ? "true" : "false") : "true",
      status: trip?.status ?? "draft",
    });
  }, [open, trip, reset]);

  const onSubmit = async (values: TripFormValues) => {
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
      start_date: values.startDate || null,
      end_date: values.endDate || null,
      is_public: values.isPublic === "true",
      status: values.status,
    };
    try {
      if (trip) {
        await updateTrip(token, trip.id, payload);
      } else {
        await createTrip(token, payload);
      }
      toast.success(trip ? "已保存" : "已创建");
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(errorMessage(err, "保存失败"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{trip ? "编辑行程" : "新建行程"}</DialogTitle>
          <DialogDescription className="sr-only">
            填写行程基本信息
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="trip-title">标题</Label>
              <Input id="trip-title" {...register("title")} placeholder="行程标题" aria-invalid={!!errors.title} />
              {errors.title && <p className="text-sm text-destructive">{errors.title.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="trip-slug">slug</Label>
              <Controller
                control={control}
                name="slug"
                render={({ field }) => (
                  <SlugInput value={field.value} onChange={field.onChange} title={title} error={errors.slug?.message} />
                )}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="trip-desc">描述（可选）</Label>
              <Textarea id="trip-desc" {...register("description")} placeholder="行程简介" rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="trip-start">出发日期</Label>
                <Input id="trip-start" type="date" {...register("startDate")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="trip-end">结束日期</Label>
                <Input id="trip-end" type="date" {...register("endDate")} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>可见性</Label>
                <Controller
                  control={control}
                  name="isPublic"
                  render={({ field }) => (
                    <Select items={VISIBILITY_ITEMS} value={field.value} onValueChange={(val) => field.onChange(val ?? "true")}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {VISIBILITY_ITEMS.map((item) => (
                          <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label>状态</Label>
                <Controller
                  control={control}
                  name="status"
                  render={({ field }) => (
                    <Select items={STATUS_ITEMS} value={field.value} onValueChange={(val) => field.onChange(val ?? "draft")}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STATUS_ITEMS.map((item) => (
                          <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
            <Button type="submit" disabled={isSubmitting}>保存</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
