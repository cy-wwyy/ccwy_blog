"use client";

import { useEffect, useRef } from "react";
import Vditor from "vditor";
import "vditor/dist/index.css";
import "./vditor-custom.css";
import { toast } from "sonner";
import { TOKEN_KEY } from "@/lib/constants";

// 与后端 MAX_UPLOAD_SIZE_MB 保持一致
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

interface MdEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function MdEditor({ value, onChange, placeholder }: MdEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const vditorRef = useRef<Vditor | null>(null);
  const readyRef = useRef(false);

  // 跟踪上一次外部传入的 value，避免内外部更新死循环
  const lastExternalValue = useRef(value);

  // 用 ref 持有最新 onChange，避免初始化 useEffect 的空依赖数组锁死首次渲染的闭包
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    if (!containerRef.current || vditorRef.current) return;

    let destroyed = false;
    const vditor = new Vditor(containerRef.current, {
      height: "calc(100vh - 124px)",
      mode: "ir",
      placeholder: placeholder || "写点东西...",
      value: value,
      cache: { enable: false },
      counter: { enable: true },
      // 图片上传：拖拽/粘贴/工具栏上传都走后端 /admin/media（module=blog）
      upload: {
        url: "/api/v1/admin/media?module=blog",
        fieldName: "file",
        multiple: false,
        accept: "image/*",
        max: MAX_UPLOAD_BYTES,
        // 每次上传前读取最新 token，避免初始化时闭包捕获到过期/空 token
        setHeaders: (): Record<string, string> => {
          const token =
            typeof window !== "undefined"
              ? localStorage.getItem(TOKEN_KEY)
              : null;
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
        // 把后端 MediaPublic 响应转成 Vditor 内置的 succMap 结构
        format: (_files: File[], responseText: string): string => {
          const res = JSON.parse(responseText);
          return JSON.stringify({
            msg: "",
            code: 0,
            data: {
              errFiles: [],
              succMap: { [res.filename]: res.url },
            },
          });
        },
        error: () => toast.error("图片上传失败"),
      },
      after: () => {
        // 组件在初始化完成前已卸载 → 立即销毁这个迟到的实例
        if (destroyed) {
          vditor.destroy();
          return;
        }
        readyRef.current = true;
      },
      input: (val: string) => {
        lastExternalValue.current = val;
        onChangeRef.current(val);
      },
    });
    vditorRef.current = vditor;

    return () => {
      destroyed = true;
      // 已就绪的实例直接销毁；未就绪的交给 after 回调销毁
      if (readyRef.current) {
        vditor.destroy();
      }
      vditorRef.current = null;
      readyRef.current = false;
    };
    // 仅挂载时初始化一次编辑器；value/placeholder 的后续变更由下方 effect 同步
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 外部 value 变更时同步到编辑器
  useEffect(() => {
    if (!readyRef.current || !vditorRef.current) return;
    if (value === lastExternalValue.current) return;
    lastExternalValue.current = value;
    vditorRef.current.setValue(value);
  }, [value]);

  return (
    <div className="rounded-lg border overflow-hidden">
      <div ref={containerRef} className="vditor" />
    </div>
  );
}
