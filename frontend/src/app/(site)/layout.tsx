import type { CSSProperties } from "react";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { SiteSidebar } from "@/components/site/site-sidebar";
import { TopToolbar } from "@/components/site/top-toolbar";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteRightAside } from "@/components/site/site-right-aside";
import { BackgroundOrbs } from "@/components/site/background-orbs";
import { SiteInfoProvider } from "@/components/site/site-info";
import { Particles } from "@/components/ui/particles";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="lg:px-[70px]" data-boxed-layout>
      <BackgroundOrbs />
      <Particles
        className="hidden md:block fixed inset-0 z-[2]"
        quantity={30}
        ease={80}
        color="#8c8ca0"
        size={0.4}
        staticity={40}
        vx={0.1}
        vy={0.1}
      />
      <SiteInfoProvider>
        <SidebarProvider
          defaultOpen
          style={{ "--sidebar-width": "12.8rem" } as CSSProperties}
        >
          <SiteSidebar />
          <SidebarInset className="bg-transparent flex flex-col">
            {/* 顶部工具栏 */}
            <TopToolbar />

            {/* 下方：主内容 + 右栏 */}
            <div className="flex flex-1 overflow-hidden">
              {/* 主内容区 */}
              <main className="flex-1 overflow-y-auto overflow-x-hidden theme-content">{children}</main>

              {/* 右栏 — 移动端隐藏 */}
              <aside className="hidden lg:block w-[220px] overflow-y-auto shrink-0 theme-content border-l border-border/30">
                <SiteRightAside />
              </aside>
            </div>

            {/* Footer */}
            <SiteFooter />
          </SidebarInset>
        </SidebarProvider>
      </SiteInfoProvider>
    </div>
  );
}
