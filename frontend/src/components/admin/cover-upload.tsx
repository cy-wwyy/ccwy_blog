"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { ImagePlus, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { uploadMedia } from "@/lib/api";

interface CoverUploadProps {
  value: string;
  onChange: (url: string) => void;
}

export function CoverUpload({ value, onChange }: CoverUploadProps) {
  const { token } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File | undefined) => {
    if (!file || !token) return;
    setUploading(true);
    try {
      const media = await uploadMedia(token, file, "blog");
      onChange(media.url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "封面上传失败");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const pick = () => inputRef.current?.click();

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      {value ? (
        <div className="space-y-1.5">
          <div className="relative w-full aspect-video rounded-lg border overflow-hidden bg-muted">
            <Image
              src={value}
              alt="封面"
              fill
              unoptimized
              className="object-cover"
            />
            {uploading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                <Loader2 className="size-5 animate-spin text-white" />
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={pick}
              disabled={uploading}
              className="text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              更换
            </button>
            <span className="text-border">·</span>
            <button
              type="button"
              onClick={() => onChange("")}
              disabled={uploading}
              className="text-muted-foreground hover:text-destructive disabled:opacity-50"
            >
              移除
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={pick}
          disabled={uploading}
          className="w-full aspect-video rounded-lg border border-dashed flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors disabled:opacity-50"
        >
          {uploading ? (
            <>
              <Loader2 className="size-5 animate-spin" />
              <span className="text-xs">上传中...</span>
            </>
          ) : (
            <>
              <ImagePlus className="size-5" />
              <span className="text-xs">点击上传封面</span>
            </>
          )}
        </button>
      )}
    </div>
  );
}
