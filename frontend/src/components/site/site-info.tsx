"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { fetchPublicSiteInfo, type PublicSiteInfo } from "@/lib/api";

// 站点信息（站点设置 + 博主公开信息）在前台侧栏与页脚共享，
// 用 Provider 取一次下发，避免各组件重复请求。
const SiteInfoContext = createContext<PublicSiteInfo | null>(null);

export function useSiteInfo(): PublicSiteInfo | null {
  return useContext(SiteInfoContext);
}

export function SiteInfoProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [info, setInfo] = useState<PublicSiteInfo | null>(null);

  useEffect(() => {
    let active = true;
    fetchPublicSiteInfo()
      .then((i) => active && setInfo(i))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  return (
    <SiteInfoContext.Provider value={info}>{children}</SiteInfoContext.Provider>
  );
}
