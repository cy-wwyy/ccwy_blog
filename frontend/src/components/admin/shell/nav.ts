import {
  FileText,
  Images,
  Image as ImageIcon,
  LayoutDashboard,
  Route,
  Settings,
  Tags,
  UserCog,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** 仅精确匹配（避免 /admin 吃掉所有子路由） */
  exact?: boolean;
};

/** 主导航：扁平化成 78px 导轨能容纳的 6 个目的地 */
export const navItems: NavItem[] = [
  { href: "/admin", label: "概览", icon: LayoutDashboard, exact: true },
  { href: "/admin/posts", label: "文章", icon: FileText },
  { href: "/admin/trips", label: "行程", icon: Route },
  { href: "/admin/media", label: "媒体", icon: ImageIcon },
  { href: "/admin/albums", label: "相册", icon: Images },
  { href: "/admin/categories", label: "分类", icon: Tags },
];

/** 设置项收进导轨底部的弹出菜单 */
export const settingsItems: NavItem[] = [
  { href: "/admin/settings/profile", label: "博主设置", icon: UserCog },
  { href: "/admin/settings/site", label: "网页设置", icon: Settings },
  { href: "/admin/tools/totp", label: "2FA 验证码", icon: Wrench },
];

export function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
