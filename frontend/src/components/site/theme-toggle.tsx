"use client";

import { useTheme } from "@/components/theme-provider";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="切换主题"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      {/* 明暗图标可见性完全由 CSS 的 .dark 变体驱动，无需 mounted 守卫 */}
      <Sun className="size-4 rotate-0 scale-100 dark:-rotate-90 dark:scale-0 transition-all absolute" />
      <Moon className="size-4 rotate-90 scale-0 dark:rotate-0 dark:scale-100 transition-all absolute" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
