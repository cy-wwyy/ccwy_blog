"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import {
  getProfileSettings,
  updateProfileSettings,
  uploadMedia,
} from "@/lib/api";

const schema = z.object({
  display_name: z.string().min(1, "请输入显示名"),
  bio: z.string(),
  github: z
    .string()
    .refine((v) => !v || /^https?:\/\//.test(v), "请输入完整链接（http/https）"),
  website: z
    .string()
    .refine((v) => !v || /^https?:\/\//.test(v), "请输入完整链接（http/https）"),
});

type FormValues = z.infer<typeof schema>;

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export default function ProfileSettingsPage() {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { display_name: "", bio: "", github: "", website: "" },
  });

  const displayName = useWatch({ control, name: "display_name" });
  // 加载失败时锁定表单，避免用空值覆盖已有头像/资料
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadedRef = useRef<FormValues | null>(null);

  const load = useCallback(() => {
    if (!token) return () => {};
    let active = true;
    setLoading(true);
    setLoadError(null);
    getProfileSettings(token)
      .then((p) => {
        if (!active) return;
        setAvatar(p.avatar);
        setIsOwner(p.is_owner);
        const values: FormValues = {
          display_name: p.display_name ?? "",
          bio: p.bio ?? "",
          github: p.github ?? "",
          website: p.website ?? "",
        };
        loadedRef.current = values;
        reset(values);
      })
      .catch((e) => {
        if (!active) return;
        setLoadError(errorMessage(e, "加载失败"));
        toast.error(errorMessage(e, "加载资料失败，表单已锁定"));
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [token, reset]);

  useEffect(() => load(), [load]);

  const handleAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // 允许重复选同一文件
    if (!file || !token) return;
    setUploading(true);
    try {
      const res = await uploadMedia(token, file, "avatar");
      // 上传成功后自动保存头像 URL，无需再手动点「保存」
      const saved = await updateProfileSettings(token, { avatar: res.url });
      setAvatar(saved.avatar);
      toast.success("头像已更新");
    } catch (err) {
      toast.error(errorMessage(err, "上传失败"));
    } finally {
      setUploading(false);
    }
  };

  const onSubmit = async (values: FormValues) => {
    if (!token) return;
    const base = loadedRef.current;
    const diff: Partial<FormValues> = {};
    for (const key of Object.keys(values) as (keyof FormValues)[]) {
      if (!base || values[key] !== base[key]) diff[key] = values[key];
    }
    if (Object.keys(diff).length === 0) {
      toast.info("没有修改");
      return;
    }
    try {
      // 不提交 avatar：头像由上传接口单独维护，避免这里用旧 state 覆盖新头像
      const saved = await updateProfileSettings(token, {
        ...(diff.display_name !== undefined && { display_name: diff.display_name }),
        ...(diff.bio !== undefined && { bio: diff.bio || null }),
        ...(diff.github !== undefined && { github: diff.github || null }),
        ...(diff.website !== undefined && { website: diff.website || null }),
      });
      setAvatar(saved.avatar);
      loadedRef.current = { ...values };
      toast.success("已保存");
    } catch (e) {
      toast.error(errorMessage(e, "保存失败"));
    }
  };

  return (
    <div className="flex flex-1 flex-col space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold">博主设置</h1>
        {isOwner && <Badge variant="secondary">博主</Badge>}
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>个人资料</CardTitle>
          <CardDescription>
            显示在前台侧栏与页脚的博主信息。
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-20 w-20 rounded-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : loadError ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                没能读取现有资料，为避免覆盖头像与简介，表单已锁定。
              </p>
              <p className="text-xs text-muted-foreground">{loadError}</p>
              <Button type="button" onClick={() => load()}>
                重试
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              {/* 头像 */}
              <div className="flex items-center gap-4">
                <Avatar className="size-20 ring-2 ring-border">
                  {avatar && <AvatarImage src={avatar} alt="头像" />}
                  <AvatarFallback className="text-xl font-bold">
                    {displayName?.charAt(0) || "?"}
                  </AvatarFallback>
                </Avatar>
                <div className="space-y-1">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatar}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={uploading}
                    onClick={() => fileRef.current?.click()}
                  >
                    {uploading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Upload className="size-4" />
                    )}
                    上传头像
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    建议正方形图片
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="display_name">显示名</Label>
                <Input
                  id="display_name"
                  {...register("display_name")}
                  placeholder="对外展示的名字"
                  aria-invalid={!!errors.display_name}
                />
                {errors.display_name && (
                  <p className="text-sm text-destructive">
                    {errors.display_name.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="bio">简介</Label>
                <Textarea
                  id="bio"
                  {...register("bio")}
                  rows={3}
                  placeholder="一句话介绍自己"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="github">GitHub</Label>
                <Input
                  id="github"
                  {...register("github")}
                  placeholder="https://github.com/yourname"
                  aria-invalid={!!errors.github}
                />
                {errors.github && (
                  <p className="text-sm text-destructive">
                    {errors.github.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="website">个人网站</Label>
                <Input
                  id="website"
                  {...register("website")}
                  placeholder="https://example.com"
                  aria-invalid={!!errors.website}
                />
                {errors.website && (
                  <p className="text-sm text-destructive">
                    {errors.website.message}
                  </p>
                )}
              </div>

              <div className="flex justify-end">
                <Button type="submit" disabled={isSubmitting || uploading}>
                  保存
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
