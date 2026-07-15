"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MapPin, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { fetchPublicTrips, type TripCard } from "@/lib/api";

function formatDist(meters: number | null): string {
  if (!meters) return "";
  if (meters >= 1000) return `${(meters / 1000).toFixed(0)} km`;
  return `${meters} m`;
}

export function TripListClient() {
  const [trips, setTrips] = useState<TripCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetchPublicTrips({ limit: 50 });
        if (active) setTrips(res.data);
      } catch {
        // 静默失败
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-20">
        <p className="text-sm text-muted-foreground">加载中...</p>
      </div>
    );
  }

  if (trips.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
        <MapPin className="size-10" />
        <p className="text-sm">暂无行程</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold">行程</h1>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {trips.map((trip) => (
          <Link key={trip.id} href={`/trips/${trip.slug}`}>
            <Card className="group h-full overflow-hidden transition-shadow hover:shadow-md">
              {trip.cover_url ? (
                <div className="aspect-video w-full overflow-hidden bg-muted">
                  <img
                    src={trip.cover_url}
                    alt={trip.title}
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  />
                </div>
              ) : (
                <div className="flex aspect-video w-full items-center justify-center bg-muted">
                  <MapPin className="size-10 text-muted-foreground" />
                </div>
              )}
              <div className="p-4 space-y-2">
                <h2 className="font-semibold truncate">{trip.title}</h2>
                {trip.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">{trip.description}</p>
                )}
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  {trip.start_date && (
                    <span className="flex items-center gap-1">
                      <Calendar className="size-3" />
                      {trip.start_date} ~ {trip.end_date || "至今"}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <MapPin className="size-3" />
                    {trip.point_count} 个记录点
                  </span>
                  {trip.total_distance && (
                    <Badge variant="secondary" className="text-xs">
                      {formatDist(trip.total_distance)}
                    </Badge>
                  )}
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
