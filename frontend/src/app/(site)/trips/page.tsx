import { Suspense } from "react";
import type { Metadata } from "next";
import { TripListClient } from "./trip-list-client";

export const metadata: Metadata = {
  title: "行程 | ccwy blog",
  description: "摩旅行程记录",
};

export default function TripsPage() {
  return (
    <Suspense>
      <TripListClient />
    </Suspense>
  );
}
