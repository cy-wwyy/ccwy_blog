import type { Metadata } from "next";
import { ArrowUpRight, FileText } from "lucide-react";

export const metadata: Metadata = {
  title: "个人项目 | ccwy blog",
  description: "一些自己写的小工具，独立部署、点开即用。",
};

type Project = {
  name: string;
  summary: string;
  tags: string[];
  /** 站内静态目录用相对路径；外部链接写完整 URL */
  href: string;
  status: "可用" | "开发中" | "计划中";
  external?: boolean;
};

// 新增项目只改这个数组：静态子应用放 /<name>/ 下，独立构建、独立部署
const projects: Project[] = [
  {
    name: "简历生成器",
    summary:
      "本地优先的简历编辑器。结构化填写、A4 实时预览，一键导出 PDF / PNG / JSON；数据只存在浏览器里。",
    tags: ["React", "Vite", "TypeScript"],
    href: "/resume/",
    status: "可用",
  },
];

const STATUS_STYLE: Record<Project["status"], string> = {
  可用: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  开发中: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  计划中: "bg-muted text-muted-foreground",
};

export default function ProjectsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-xl font-semibold">个人项目</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          自己写的小工具，各自独立构建、独立部署，互不影响。
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {projects.map((p) => (
          <a
            key={p.name}
            href={p.href}
            target={p.external ? "_blank" : undefined}
            rel={p.external ? "noreferrer" : undefined}
            className="group flex flex-col rounded-xl border bg-card/60 p-4 transition-colors hover:border-primary/40 hover:bg-card"
          >
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <FileText className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{p.name}</span>
                  <span
                    className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] leading-none ${STATUS_STYLE[p.status]}`}
                  >
                    {p.status}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {p.summary}
                </p>
              </div>
              <ArrowUpRight className="size-4 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-primary" />
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {p.tags.map((t) => (
                <span
                  key={t}
                  className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                >
                  {t}
                </span>
              ))}
            </div>
          </a>
        ))}
      </div>

      <p className="mt-8 text-xs text-muted-foreground">
        更多项目陆续接入，路径统一为 <code className="rounded bg-muted px-1">/&lt;name&gt;/</code>。
      </p>
    </div>
  );
}
