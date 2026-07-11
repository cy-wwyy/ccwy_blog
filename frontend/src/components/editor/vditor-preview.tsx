"use client";

import { useEffect, useRef } from "react";
import Vditor from "vditor";
import "vditor/dist/index.css";
import { useTheme } from "@/components/theme-provider";

interface VditorPreviewProps {
  content: string;
}

export function VditorPreview({ content }: VditorPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !content) return;
    Vditor.preview(el, content, {
      mode: isDark ? "dark" : "light",
      hljs: {
        enable: true,
        lineNumber: false,
        defaultLang: "",
        style: isDark ? "github-dark" : "github",
      },
      theme: {
        current: isDark ? "dark" : "light",
      },
    }).catch(() => {
      // 渲染失败降级为纯文本（直接改 DOM，避免 effect 里同步 setState）
      el.textContent = content;
    });
  }, [content, isDark]);

  if (!content) {
    return <p className="text-muted-foreground text-sm">暂无内容</p>;
  }

  return <div ref={containerRef} className="vditor-reset" />;
}
