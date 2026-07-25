"use client";

import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { MapPin, Loader2 } from "lucide-react";
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
import { createTripPoint, updateTripPoint, type TripPointPublic } from "@/lib/api";

const POINT_TYPE_ITEMS = [
  { label: "住宿", value: "accommodation" },
  { label: "露营", value: "camping" },
  { label: "休整", value: "rest" },
  { label: "观景台", value: "viewpoint" },
  { label: "午餐", value: "lunch" },
  { label: "加油", value: "gas" },
  { label: "修车", value: "repair" },
  { label: "垭口", value: "pass" },
  { label: "古城", value: "ancient_town" },
  { label: "其他", value: "other" },
];

const pointSchema = z.object({
  title: z.string().min(1, "请输入标题"),
  pointType: z.string(),
  locationName: z.string(),
  latitude: z.string(),
  longitude: z.string(),
  arrivedAt: z.string(),
  description: z.string(),
});

type PointFormValues = z.infer<typeof pointSchema>;

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

/** 将 Date 或 ISO 字符串转为 datetime-local 输入格式（浏览器本地时间） */
function toDatetimeLocalInput(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  // 调整时区偏移，把 UTC Date 的显示值转为本地时间
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

/** 将 datetime-local 输入值（本地时间）解析为 UTC ISO 字符串，避免浏览器差异 */
function dateTimeLocalToUtc(value: string): string {
  const [datePart, timePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  // 使用显式本地时间构造，不依赖 new Date(string) 的浏览器实现在
  const localDate = new Date(year, month - 1, day, hour, minute);
  return localDate.toISOString();
}

interface TripPointFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
  point: TripPointPublic | null;
  onSaved: () => void;
}

export function TripPointFormDialog({
  open,
  onOpenChange,
  tripId,
  point,
  onSaved,
}: TripPointFormDialogProps) {
  const { token } = useAuth();
  const [gettingLoc, setGettingLoc] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<PointFormValues>({
    resolver: zodResolver(pointSchema),
    defaultValues: {
      title: "", pointType: "other", locationName: "",
      latitude: "", longitude: "",
      arrivedAt: "", description: "",
    },
  });

  useEffect(() => {
    if (!open) return;
    reset({
      title: point?.title ?? "",
      pointType: point?.point_type ?? "other",
      locationName: point?.location_name ?? "",
      latitude: point?.latitude != null ? String(point.latitude) : "",
      longitude: point?.longitude != null ? String(point.longitude) : "",
      arrivedAt: point?.arrived_at
        ? toDatetimeLocalInput(point.arrived_at)
        : toDatetimeLocalInput(new Date()),
      description: point?.description ?? "",
    });
  }, [open, point, reset]);

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      toast.error("浏览器不支持定位");
      return;
    }
    setGettingLoc(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setValue("latitude", pos.coords.latitude.toFixed(6));
        setValue("longitude", pos.coords.longitude.toFixed(6));
        setGettingLoc(false);
        toast.success("已获取位置");
      },
      () => {
        setGettingLoc(false);
        toast.error("获取位置失败，请检查浏览器权限");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const onSubmit = async (values: PointFormValues) => {
    if (!token) return;
    const latStr = values.latitude.trim();
    const lngStr = values.longitude.trim();
    const locName = values.locationName.trim();

    if (!locName && (!latStr || !lngStr)) {
      toast.error("地名和经纬度不能同时为空");
      return;
    }

    const payload = {
      trip_id: tripId,
      title: values.title,
      description: values.description || null,
      point_type: values.pointType,
      location_name: locName || null,
      latitude: latStr ? parseFloat(latStr) : null,
      longitude: lngStr ? parseFloat(lngStr) : null,
      arrived_at: values.arrivedAt ? dateTimeLocalToUtc(values.arrivedAt) : undefined,
      sort_order: point?.sort_order ?? 0,
    };

    try {
      if (point) {
        await updateTripPoint(token, tripId, point.id, payload);
      } else {
        await createTripPoint(token, tripId, payload);
      }
      toast.success(point ? "已保存" : "已添加");
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
          <DialogTitle>{point ? "编辑记录点" : "添加记录点"}</DialogTitle>
          <DialogDescription className="sr-only">
            填写记录点信息
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="pt-title">标题</Label>
              <Input id="pt-title" {...register("title")} placeholder="如「翻越折多山」" aria-invalid={!!errors.title} />
              {errors.title && <p className="text-sm text-destructive">{errors.title.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>类型</Label>
              <select
                {...register("pointType")}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {POINT_TYPE_ITEMS.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pt-locname">地名</Label>
              <Input id="pt-locname" {...register("locationName")} placeholder="如「四川省甘孜州康定市」" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label htmlFor="pt-lat">纬度</Label>
                <Input id="pt-lat" {...register("latitude")} placeholder="如 30.0528" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pt-lng">经度</Label>
                <Input id="pt-lng" {...register("longitude")} placeholder="如 101.9638" />
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full gap-1"
              onClick={handleGetLocation}
              disabled={gettingLoc}
            >
              {gettingLoc ? <Loader2 className="size-4 animate-spin" /> : <MapPin className="size-4" />}
              获取当前位置
            </Button>
            <div className="space-y-2">
              <Label htmlFor="pt-arrived">到达时间</Label>
              <Input id="pt-arrived" type="datetime-local" {...register("arrivedAt")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pt-desc">描述（可选）</Label>
              <Textarea id="pt-desc" {...register("description")} placeholder="简短记录" rows={2} />
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
