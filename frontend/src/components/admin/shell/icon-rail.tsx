"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, LogOut, Settings } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/site/theme-toggle";
import { BrandMark } from "./brand-mark";
import { isActive, navItems, settingsItems } from "./nav";
import { cn } from "@/lib/utils";

const itemBase =
  "flex size-11 items-center justify-center rounded-2xl transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/40";
const itemIdle =
  "text-muted-foreground hover:bg-secondary hover:text-foreground";
const itemActive = "bg-accent text-accent-foreground";

export function IconRail() {
  const pathname = usePathname();
  const { logout } = useAuth();
  const settingsActive = settingsItems.some((s) => isActive(pathname, s));

  return (
    <aside className="hidden w-[78px] shrink-0 flex-col items-center border-r border-border py-5 lg:flex">
      <Link
        href="/admin"
        aria-label="Nova 后台首页"
        className="mb-5 flex size-11 items-center justify-center rounded-2xl transition-colors hover:bg-secondary"
      >
        <BrandMark size={32} />
      </Link>

      <nav className="flex flex-1 flex-col items-center gap-1.5">
        {navItems.map((item) => {
          const active = isActive(pathname, item);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              className={cn(itemBase, active ? itemActive : itemIdle)}
            >
              <Icon className="size-[21px]" strokeWidth={active ? 2.1 : 1.8} />
            </Link>
          );
        })}
      </nav>

      <div className="flex flex-col items-center gap-1.5">
        <div className="[&>button]:size-11 [&>button]:rounded-2xl [&>button]:text-muted-foreground [&>button]:hover:bg-secondary [&>button]:hover:text-foreground">
          <ThemeToggle />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                aria-label="设置"
                title="设置"
                className={cn(
                  itemBase,
                  settingsActive ? itemActive : itemIdle,
                )}
              />
            }
          >
            <Settings className="size-[21px]" strokeWidth={settingsActive ? 2.1 : 1.8} />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="end" sideOffset={8} className="w-44">
            <DropdownMenuGroup>
              <DropdownMenuLabel>设置</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {settingsItems.map((s) => {
                const Icon = s.icon;
                return (
                  <DropdownMenuItem
                  key={s.href}
                  render={<Link href={s.href} />}
                  className={cn(
                    "gap-2",
                    isActive(pathname, s) && "bg-accent text-accent-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  {s.label}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => logout()} className="gap-2">
              <LogOut className="size-4" />
              退出登录
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Link
          href="/"
          title="返回前台"
          aria-label="返回前台"
          className={cn(itemBase, itemIdle)}
        >
          <ArrowUpRight className="size-[21px]" strokeWidth={1.8} />
        </Link>
      </div>
    </aside>
  );
}
