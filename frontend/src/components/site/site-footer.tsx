import Link from "next/link";
import { Rss, Heart } from "lucide-react";

// lucide v1 移除了品牌图标，GitHub logo 用内联 SVG 保持识别度
function GithubIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 .5C5.37.5 0 5.87 0 12.5c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58 0-.29-.01-1.04-.02-2.05-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.33-1.76-1.33-1.76-1.09-.75.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5.99.11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.34-5.47-5.96 0-1.32.47-2.39 1.24-3.23-.12-.3-.54-1.53.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.77.84 1.24 1.91 1.24 3.23 0 4.63-2.81 5.65-5.49 5.95.43.37.81 1.1.81 2.22 0 1.6-.01 2.9-.01 3.29 0 .32.22.7.83.58A12 12 0 0 0 24 12.5C24 5.87 18.63.5 12 .5z" />
    </svg>
  );
}

export function SiteFooter() {
  return (
    <footer className="theme-content border-t border-border/50 mt-auto">
      <div className="max-w-5xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>© {new Date().getFullYear()} CCWY</span>
          <span className="text-border">·</span>
          <span className="inline-flex items-center gap-1">
            用 <Heart size={12} className="text-red-500 fill-red-500" /> 构建
          </span>
        </div>

        <div className="flex items-center gap-4">
          <Link
            href="/api/feed/rss"
            target="_blank"
            className="text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1.5 text-sm"
          >
            <Rss size={14} />
            RSS
          </Link>
          <Link
            href="https://github.com/cy-wwyy"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <GithubIcon size={16} />
          </Link>
        </div>
      </div>
    </footer>
  );
}

