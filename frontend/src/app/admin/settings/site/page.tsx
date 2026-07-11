"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { getSiteSettings, updateSiteSettings } from "@/lib/api";

const schema = z.object({
  site_title: z.string().min(1, "请输入网站标题"),
  site_subtitle: z.string(),
  footer_text: z.string(),
  icp: z.string(),
});

type FormValues = z.infer<typeof schema>;

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export default function SiteSettingsPage() {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      site_title: "",
      site_subtitle: "",
      footer_text: "",
      icp: "",
    },
  });

  useEffect(() => {
    if (!token) return;
    let active = true;
    getSiteSettings(token)
      .then((s) => active && reset(s))
      .catch((e) => active && toast.error(errorMessage(e, "加载失败")))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [token, reset]);

  const onSubmit = async (values: FormValues) => {
    if (!token) return;
    try {
      const saved = await updateSiteSettings(token, values);
      reset(saved);
      toast.success("已保存");
    } catch (e) {
      toast.error(errorMessage(e, "保存失败"));
    }
  };

  return (
    <div className="flex flex-1 flex-col space-y-4">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        <h1 className="text-lg font-semibold">网页设置</h1>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>站点信息</CardTitle>
          <CardDescription>
            网站标题、副标题及页脚等前台展示信息。
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="site_title">网站标题</Label>
                <Input
                  id="site_title"
                  {...register("site_title")}
                  placeholder="我的博客"
                  aria-invalid={!!errors.site_title}
                />
                {errors.site_title && (
                  <p className="text-sm text-destructive">
                    {errors.site_title.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="site_subtitle">副标题</Label>
                <Input
                  id="site_subtitle"
                  {...register("site_subtitle")}
                  placeholder="记录技术与生活"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="footer_text">页脚版权</Label>
                <Textarea
                  id="footer_text"
                  {...register("footer_text")}
                  rows={2}
                  placeholder="© 2026 CCWY. 保留所有权利。"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="icp">ICP 备案号</Label>
                <Input
                  id="icp"
                  {...register("icp")}
                  placeholder="京ICP备00000000号"
                />
              </div>

              <div className="flex justify-end">
                <Button type="submit" disabled={isSubmitting}>
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
