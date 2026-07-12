"use client";

import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
  ai_enabled: z.string(),
  ai_api_base: z.string(),
  ai_api_key: z.string(),
  ai_model: z.string(),
  ai_reasoning_effort: z.string(),
  ai_extra_body: z.string(),
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
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      site_title: "",
      site_subtitle: "",
      footer_text: "",
      icp: "",
      ai_enabled: "",
      ai_api_base: "",
      ai_api_key: "",
      ai_model: "",
      ai_reasoning_effort: "",
      ai_extra_body: "",
    },
  });

  const aiEnabled = useWatch({ control, name: "ai_enabled" });

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
            <form id="site-form" onSubmit={handleSubmit(onSubmit)} className="space-y-5">
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
            </form>
          )}
        </CardContent>
      </Card>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>AI 设置</CardTitle>
          <CardDescription>
            配置大模型用于自动生成 slug 等功能。支持 OpenAI 兼容 API（Ollama、vLLM、国内代理等）。
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : (
            <form id="ai-form" onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>启用 AI</Label>
                  <p className="text-xs text-muted-foreground">
                    关闭后 slug 生成回退为手动填写
                  </p>
                </div>
                <input
                  type="hidden"
                  {...register("ai_enabled")}
                />
                <Switch
                  checked={aiEnabled === "true"}
                  onCheckedChange={(v) => {
                    register("ai_enabled").onChange({
                      target: { name: "ai_enabled", value: v ? "true" : "" },
                    });
                  }}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ai_api_base">API 地址</Label>
                <Input
                  id="ai_api_base"
                  {...register("ai_api_base")}
                  placeholder="https://api.openai.com/v1"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ai_api_key">API Key</Label>
                <Input
                  id="ai_api_key"
                  type="password"
                  {...register("ai_api_key")}
                  placeholder="sk-••••••••"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ai_model">模型</Label>
                <Input
                  id="ai_model"
                  {...register("ai_model")}
                  placeholder="gpt-4o-mini"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ai_reasoning_effort">思考强度</Label>
                <Input
                  id="ai_reasoning_effort"
                  {...register("ai_reasoning_effort")}
                  placeholder="留空为默认；设为 low / medium / high"
                />
                <p className="text-xs text-muted-foreground">
                  OpenAI reasoning_effort 参数，留空不传。slug 场景建议留空或设为 low
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ai_extra_body">额外参数 (JSON)</Label>
                <Textarea
                  id="ai_extra_body"
                  {...register("ai_extra_body")}
                  rows={3}
                  placeholder='{"thinking": {"type": "disabled"}}'
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground">
                  透传 extra_body。DeepSeek 关闭思考：<code>{'{"thinking": {"type": "disabled"}}'}</code>
                </p>
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
