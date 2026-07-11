import { Suspense } from "react";
import type { Metadata } from "next";
import { AlbumsGallery } from "./albums-gallery";

export const metadata: Metadata = {
  title: "相册 | ccwy blog",
  description: "相册",
};

export default function AlbumsPage() {
  return (
    <Suspense>
      <AlbumsGallery />
    </Suspense>
  );
}
