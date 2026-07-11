"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LayoutDashboard,
  FileText,
  Image,
  LogOut,
  Home,
  ChevronsUpDown,
  ChevronRight,
  Settings,
} from "lucide-react";

const navMain = [
  {
    title: "内容管理",
    icon: FileText,
    isActive: true,
    items: [
      { title: "文章", url: "/admin/posts" },
      { title: "分类 / 标签", url: "/admin/categories" },
    ],
  },
  {
    title: "媒体库",
    icon: Image,
    items: [
      { title: "所有文件", url: "/admin/media" },
      { title: "相册", url: "/admin/albums" },
    ],
  },
  {
    title: "设置",
    icon: Settings,
    items: [
      { title: "博主设置", url: "/admin/settings/profile" },
      { title: "网页设置", url: "/admin/settings/site" },
    ],
  },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { setOpenMobile } = useSidebar();
  // 移动端点击导航后收起侧栏（桌面端无副作用）
  const closeMobile = () => setOpenMobile(false);

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarContent>
        {/* 仪表盘（置顶） */}
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={pathname === "/admin"}
                tooltip="仪表盘"
                size="lg"
                render={<Link href="/admin" onClick={closeMobile} />}
              >
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <LayoutDashboard className="size-4" />
                </div>
                <span>仪表盘</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        {/* 主导航 + 子菜单 */}
        <SidebarGroup>
          <SidebarGroupLabel>导航</SidebarGroupLabel>
          <SidebarMenu>
            {navMain.map((section) =>
              section.items.length > 0 ? (
                <Collapsible
                  key={section.title}
                  defaultOpen={section.isActive}
                  render={<SidebarMenuItem />}
                >
                  <CollapsibleTrigger
                    render={
                      <SidebarMenuButton
                        tooltip={section.title}
                        className="group/collapsible"
                      />
                    }
                  >
                    <section.icon />
                    <span>{section.title}</span>
                    <ChevronRight className="ml-auto transition-transform group-aria-expanded/collapsible:rotate-90" />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {section.items.map((item) => (
                        <SidebarMenuSubItem key={item.title}>
                          <SidebarMenuSubButton
                            isActive={pathname === item.url}
                            render={<Link href={item.url} onClick={closeMobile} />}
                          >
                            <span>{item.title}</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </Collapsible>
              ) : (
                <SidebarMenuItem key={section.title}>
                  <SidebarMenuButton tooltip={section.title} render={<span />}>
                    <section.icon />
                    <span>{section.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            )}
          </SidebarMenu>
        </SidebarGroup>

      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton
                    size="lg"
                    className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                  />
                }
              >
                <Avatar className="size-6 rounded-lg">
                  <AvatarFallback className="rounded-lg text-xs">
                    {user?.username?.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user?.username}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {user?.email}
                  </span>
                </div>
                <ChevronsUpDown className="ml-auto size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-(--anchor-width) min-w-56"
                side="bottom"
                align="end"
                sideOffset={4}
              >
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="p-0 font-normal">
                    <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                      <Avatar className="size-6 rounded-lg">
                        <AvatarFallback className="rounded-lg text-xs">
                          {user?.username?.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="grid flex-1 text-left text-sm leading-tight">
                        <span className="truncate font-medium">
                          {user?.username}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {user?.email}
                        </span>
                      </div>
                    </div>
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem render={<Link href="/" onClick={closeMobile} />}>
                    <Home />
                    返回前台
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => { closeMobile(); logout(); }}>
                  <LogOut />
                  退出登录
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
