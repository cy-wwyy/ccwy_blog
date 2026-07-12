"use client";

import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { generateSlug } from "@/lib/api";

interface SlugInputProps {
  value: string;
  onChange: (slug: string) => void;
  title: string;
  disabled?: boolean;
  error?: string;
}

export function SlugInput({
  value,
  onChange,
  title,
  disabled,
  error,
}: SlugInputProps) {
  const { token } = useAuth();
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async () => {
    if (!title.trim() || generating || !token) return;
    setGenerating(true);
    try {
      const { slug } = await generateSlug(token, title);
      if (slug) onChange(slug);
    } catch {
      // 静默失败，不阻塞手动输入
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        <div className="relative flex-1">
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="url-friendly-slug"
            disabled={disabled}
            aria-invalid={!!error}
            className="pr-8"
          />
          <button
            type="button"
            disabled={generating || !title.trim()}
            onClick={handleGenerate}
            title="AI 生成 slug"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
          >
            {generating ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
          </button>
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

/**
 * 提交时自动补全 slug 的工具函数。
 * 返回生成的 slug；失败时抛出错误（调用方 toast 提示）。
 */
/**
 * 提交时自动补全 slug 的工具 hook。
 * 返回包装函数，在 form submit 时调用。
 *
 * 用法:
 *   const { token } = useAuth();
 *   const maybeFillSlug = useAutoFillSlug(token);
 *   const onSubmit = async (values) => {
 *     const slug = await maybeFillSlug(values.title, values.slug);
 *     await doSave({ ...values, slug });
 *   };
 */
export function useAutoFillSlug(token: string | null) {
  return async (title: string, currentSlug: string): Promise<string> => {
    if (currentSlug.trim()) return currentSlug;
    if (!title.trim() || !token) return currentSlug;
    try {
      const { slug } = await generateSlug(token, title);
      return slug || currentSlug;
    } catch {
      return currentSlug; // 失败时保留原值，校验会报错提示手动填写
    }
  };
}
