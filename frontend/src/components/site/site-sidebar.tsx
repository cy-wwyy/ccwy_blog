"use client";

import { Suspense, useState, useEffect } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import { Home, Images, Info, LayoutGrid, ChevronRight } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { fetchPublicCategories, type CategoryPublic } from "@/lib/api";
import { cn } from "@/lib/utils";

// 占位作者信息 — 后端站点设置接口就绪后替换
const AUTHOR = { name: "CCWY", bio: "记录技术与生活" };

const navItems = [
  { href: "/", label: "首页", icon: Home },
  { href: "/projects", label: "作品集", icon: Images },
  { href: "/about", label: "关于", icon: Info },
];

// 选中态样式
const ACTIVE_CLASS =
  "bg-sidebar-accent text-sidebar-accent-foreground font-medium";

interface CatNode extends CategoryPublic {
  children: CatNode[];
}

function buildTree(cats: CategoryPublic[]): CatNode[] {
  const map = new Map<string, CatNode>();
  cats.forEach((c) => map.set(c.id, { ...c, children: [] }));
  const roots: CatNode[] = [];
  map.forEach((node) => {
    if (node.parent_id && map.has(node.parent_id)) {
      map.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  const bySort = (a: CatNode, b: CatNode) => a.sort_order - b.sort_order;
  roots.sort(bySort);
  map.forEach((n) => n.children.sort(bySort));
  return roots;
}

export function SiteSidebar() {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="pb-2">
        <div className="flex flex-col items-center gap-3 pt-6 pb-2">
          <HoverCard>
            <HoverCardTrigger>
              <Avatar className="size-16 ring-2 ring-sidebar-border shadow-md cursor-pointer transition-transform hover:scale-105">
                <AvatarFallback className="text-xl font-bold bg-sidebar-primary text-sidebar-primary-foreground">
                  {AUTHOR.name.charAt(0)}
                </AvatarFallback>
              </Avatar>
            </HoverCardTrigger>
            <HoverCardContent side="right" className="w-48 text-sm">
              <div className="font-semibold">{AUTHOR.name}</div>
              <p className="text-xs text-muted-foreground mt-1">{AUTHOR.bio}</p>
            </HoverCardContent>
          </HoverCard>
          <div className="text-center">
            <p className="text-sm font-semibold leading-tight">{AUTHOR.name}</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed text-center">{AUTHOR.bio}</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {/* 导航与分类树依赖 useSearchParams（读 ?category），需置于 Suspense 内 */}
        <Suspense fallback={null}>
          <SidebarNav />
        </Suspense>
      </SidebarContent>
    </Sidebar>
  );
}

function SidebarNav() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setOpenMobile } = useSidebar();
  const [categories, setCategories] = useState<CatNode[]>([]);

  useEffect(() => {
    fetchPublicCategories()
      .then((cats) => setCategories(buildTree(cats)))
      .catch(() => {});
  }, []);

  // 当前选中的分类（分类筛选在 /blog 列表页生效）
  const activeCategory =
    pathname === "/blog" ? searchParams.get("category") : null;
  const isHomeActive = pathname === "/";

  return (
    <>
      <SidebarGroup>
        <SidebarGroupLabel>导航</SidebarGroupLabel>
        <SidebarMenu>
          {navItems.map((item) => {
            const active =
              item.href === "/"
                ? isHomeActive
                : pathname.startsWith(item.href);
            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  onClick={() => {
                    setOpenMobile(false);
                    router.push(item.href);
                  }}
                  onMouseEnter={() => router.prefetch(item.href)}
                  isActive={active}
                  tooltip={item.label}
                  className="group"
                >
                  <item.icon className="text-muted-foreground group-hover:text-sidebar-accent-foreground transition-colors" size={18} />
                  <span>{item.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroup>

      {/* 分类 */}
      {categories.length > 0 && (
        <SidebarGroup>
          <SidebarGroupLabel className="flex items-center gap-1.5 text-muted-foreground">
            <LayoutGrid size={13} />
            分类
          </SidebarGroupLabel>
          <ul className="space-y-0.5 text-sm">
            {categories.map((cat) => (
              <CategoryTreeItem
                key={cat.id}
                cat={cat}
                activeSlug={activeCategory}
              />
            ))}
          </ul>
        </SidebarGroup>
      )}
    </>
  );
}

function CategoryTreeItem({
  cat,
  activeSlug,
}: {
  cat: CatNode;
  activeSlug: string | null;
}) {
  const [expanded, setExpanded] = useState(true);
  const { setOpenMobile } = useSidebar();
  const hasChildren = cat.children.length > 0;
  const isActive = activeSlug === cat.slug;

  return (
    <li>
      <Link
        href={`/blog?category=${cat.slug}`}
        onClick={(e) => {
          if (hasChildren) {
            // 有子分类时点击仅展开/收起，不导航、不关闭侧栏
            e.preventDefault();
            setExpanded(!expanded);
          } else {
            setOpenMobile(false);
          }
        }}
        className={cn(
          "flex items-center justify-between py-1.5 pl-3 pr-2 rounded-md transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground text-muted-foreground",
          isActive && ACTIVE_CLASS
        )}
      >
        <span className="flex-1 truncate">{cat.name}</span>
        {hasChildren && (
          <ChevronRight
            size={14}
            className={cn("shrink-0 text-muted-foreground/50 transition-transform", expanded && "rotate-90")}
          />
        )}
      </Link>

      {expanded && hasChildren && (
        <ul className="ml-3 border-l border-sidebar-border/50">
          {cat.children.map((child) => (
            <li key={child.id}>
              <Link
                href={`/blog?category=${child.slug}`}
                onClick={() => setOpenMobile(false)}
                className={cn(
                  "flex items-center py-1.5 pl-3 pr-2 rounded-r-md text-xs transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground text-muted-foreground",
                  activeSlug === child.slug && ACTIVE_CLASS
                )}
              >
                <span className="flex-1 truncate">{child.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
