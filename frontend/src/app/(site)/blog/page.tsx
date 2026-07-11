import { Suspense } from "react";
import type { Metadata } from "next";
import { BlogList } from "./blog-list";

export const metadata: Metadata = {
  title: "文章 | ccwy blog",
  description: "文章列表",
};

export default function BlogPage() {
  return (
    <Suspense>
      <BlogList />
    </Suspense>
  );
}
