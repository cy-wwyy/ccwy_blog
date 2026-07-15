import { Suspense } from "react";
import type { Metadata } from "next";
import { TripMapFullscreen } from "./trip-map-fullscreen";

export const metadata: Metadata = {
  title: "行程详情 | ccwy blog",
};

export default function TripDetailPage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">加载中...</p>
      </div>
    }>
      <TripMapFullscreen />
    </Suspense>
  );
}
