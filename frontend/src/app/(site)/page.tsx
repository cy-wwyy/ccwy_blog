import { Suspense } from "react";
import type { Metadata } from "next";
import { HomeFeed } from "./home-feed";

export const metadata: Metadata = {
  title: "首页 | ccwy blog",
  description: "记录技术与生活",
};

export default function HomePage() {
  return (
    <Suspense>
      <HomeFeed />
    </Suspense>
  );
}
