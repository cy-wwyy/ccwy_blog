"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { MapPin, Calendar, Navigation, ArrowLeft, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { fetchPublicTrip, type TripView, type TripPointView } from "@/lib/api";

const POINT_TYPE_META: Record<string, { label: string; color: string }> = {
  accommodation: { label: "住宿", color: "#e74c3c" },
  viewpoint: { label: "观景", color: "#2ecc71" },
  lunch: { label: "午餐", color: "#f39c12" },
  gas: { label: "加油", color: "#3498db" },
  repair: { label: "修车", color: "#95a5a6" },
  pass: { label: "垭口", color: "#9b59b6" },
  ancient_town: { label: "古城", color: "#e67e22" },
  other: { label: "其他", color: "#7f8c8d" },
};

const DAY_COLORS = [
  "#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#6366f1", "#84cc16",
];

function formatDist(meters: number | null): string {
  if (!meters) return "";
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${meters} m`;
}

/** 生成标记点的 HTML。isLast 时渲染为 GPS 定位样式（脉冲波纹 + 定位点）。 */
function buildMarkerHtml(label: number | string, pointType: string, isLast: boolean): string {
  const meta = POINT_TYPE_META[pointType] ?? POINT_TYPE_META.other;

  if (!isLast) {
    // 普通编号圆点
    return `<div style="width:28px;height:28px;border-radius:50%;background:${meta.color};border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:11px;color:#fff;font-weight:bold;cursor:pointer;">${label}</div>`;
  }

  // 末点：GPS 定位样式 — 脉冲外圈 + 实心定位点
  return `
    <div style="position:relative;width:36px;height:36px;display:flex;align-items:center;justify-content:center;cursor:pointer;">
      <div style="position:absolute;width:36px;height:36px;border-radius:50%;background:${meta.color};opacity:0.25;animation:gps-pulse 2s ease-out infinite;"></div>
      <div style="position:absolute;width:28px;height:28px;border-radius:50%;background:${meta.color};border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;font-size:10px;color:#fff;font-weight:bold;">${label}</div>
    </div>`;
}

function groupByDay(points: TripPointView[]): Map<string, TripPointView[]> {
  const map = new Map<string, TripPointView[]>();
  for (const p of points) {
    const day = p.arrived_at ? p.arrived_at.slice(0, 10) : "unknown";
    if (!map.has(day)) map.set(day, []);
    map.get(day)!.push(p);
  }
  return map;
}

export function TripMapFullscreen() {
  const router = useRouter();
  const params = useParams();
  const slug = params.slug as string;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<AMap.Map | null>(null);
  const amapModuleRef = useRef<typeof AMap | null>(null);
  const allMarkersRef = useRef<AMap.Marker[]>([]);
  const replayTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const replayMarkerRef = useRef<AMap.Marker | null>(null);

  const [trip, setTrip] = useState<TripView | null>(null);
  const [loading, setLoading] = useState(true);
  const [hovered, setHovered] = useState<{ point: TripPointView; x: number; y: number } | null>(null);
  const [isReplaying, setIsReplaying] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await fetchPublicTrip(slug);
        if (active) setTrip(data);
      } catch { /* 404 */ } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [slug]);

  useEffect(() => {
    if (!trip || mapInstanceRef.current) return;
    let cancelled = false;

    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const AMapLoader = (await import("@amap/amap-jsapi-loader")) as any;

      (window as unknown as Record<string, unknown>)._AMapSecurityConfig = {
        securityJsCode: process.env.NEXT_PUBLIC_AMAP_SECRET || "",
      };

      const AMapModule: typeof AMap = await AMapLoader.default.load({
        key: process.env.NEXT_PUBLIC_AMAP_KEY || "",
        version: "2.0",
      });

      if (cancelled || !containerRef.current) return;

      amapModuleRef.current = AMapModule;

      // Inject GPS pulse keyframes for the last-marker animation
      if (!document.getElementById("gps-pulse-style")) {
        const style = document.createElement("style");
        style.id = "gps-pulse-style";
        style.textContent = "@keyframes gps-pulse{0%{transform:scale(0.6);opacity:0.5}to{transform:scale(1.8);opacity:0}}";
        document.head.appendChild(style);
      }

      const map = new AMapModule.Map(containerRef.current, {
        zoom: 5,
        center: [104.0, 37.0],
        mapStyle: "amap://styles/whitesmoke",
        features: ["bg", "road", "district", "point"],
      });

      mapInstanceRef.current = map;

      const points = trip.points;
      allMarkersRef.current = [];

      // Pre-snap: use polyline start/end coords as the road-level positions
      const snappedPositions: ([number, number] | null)[] = points.map((p, i) => {
        if (p.latitude == null || p.longitude == null) return null;
        if (p.polyline_to_next) {
          const seg = decodeAmapPolyline(p.polyline_to_next);
          return seg.length > 0 ? seg[0] : [p.longitude, p.latitude] as [number, number];
        }
        // Last point: snap to end of previous polyline
        if (i > 0 && points[i - 1].polyline_to_next) {
          const seg = decodeAmapPolyline(points[i - 1].polyline_to_next!);
          return seg.length > 0 ? seg[seg.length - 1] : [p.longitude, p.latitude] as [number, number];
        }
        return [p.longitude, p.latitude] as [number, number];
      });

      points.forEach((point, idx) => {
        const pos = snappedPositions[idx];
        if (!pos) return;
        const isLast = idx === points.length - 1;

        const content = document.createElement("div");
        content.innerHTML = buildMarkerHtml(idx + 1, point.point_type, isLast);

        const marker = new AMapModule.Marker({
          position: pos,
          content,
          anchor: "center",
          offset: new AMapModule.Pixel(0, 0),
        });
        marker.on("mouseover", () => {
          const px = map.lngLatToContainer([point.longitude!, point.latitude!]);
          setHovered({ point, x: px.x, y: px.y });
        });
        marker.on("mouseout", () => setHovered(null));
        map.add(marker);
        allMarkersRef.current.push(marker);
      });

      // Zoom-based marker visibility: fewer markers at low zoom, all at high zoom.
      // First and last points are always visible regardless of zoom level.
      const updateMarkerVisibility = () => {
        const z = map.getZoom();
        const lastIdx = allMarkersRef.current.length - 1;
        allMarkersRef.current.forEach((m, i) => {
          if (i === 0 || i === lastIdx) { m.setMap(map); return; }
          if (z <= 5) {
            // Only show every 4th marker at low zoom
            m.setMap(i % 4 === 0 ? map : null);
          } else if (z <= 7) {
            // Show every other marker at medium zoom
            m.setMap(i % 2 === 0 ? map : null);
          } else {
            // Show all at high zoom
            m.setMap(map);
          }
        });
      };
      updateMarkerVisibility();
      map.on("zoomend", updateMarkerVisibility);
      map.on("click", () => setHovered(null));
      map.on("movestart", () => setHovered(null));

      // Polylines by day
      const dayMap = groupByDay(points);
      const dayKeys = Array.from(dayMap.keys());
      dayKeys.forEach((day, dayIdx) => {
        const dayPoints = dayMap.get(day)!;
        const color = DAY_COLORS[dayIdx % DAY_COLORS.length];
        dayPoints.forEach((point) => {
          if (!point.polyline_to_next) return;
          let path: [number, number][] = [];
          try { path = decodeAmapPolyline(point.polyline_to_next); } catch { return; }
          if (path.length < 2) return;
          map.add(new AMapModule.Polyline({
            path, strokeColor: color, strokeWeight: 4,
            strokeOpacity: 0.75, lineJoin: "round",
          }));
        });
      });

      // Keep default China overview — don't auto-zoom to markers
    })();

    return () => { cancelled = true; };
  }, [trip]);

  // ── Loca replay animation ───────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const loadLoca = async (): Promise<any> => {
    if (typeof window !== "undefined" && (window as any).Loca) return (window as any).Loca;
    return new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = `https://webapi.amap.com/loca?v=2.0.0&key=${process.env.NEXT_PUBLIC_AMAP_KEY || ""}`;
      script.onload = () => resolve((window as any).Loca ?? null);
      script.onerror = () => resolve(null);
      document.head.appendChild(script);
    });
  };

  const startReplay = async () => {
    const map = mapInstanceRef.current;
    const markers = allMarkersRef.current;
    if (!map || !trip || markers.length === 0) return;

    stopReplay();

    // Load Loca
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const LocaLib: any = await loadLoca();
    if (!LocaLib) {
      toast.error("回放组件加载失败，请刷新后重试");
      return;
    }

    // Build path + per-point progress percentages
    const path: [number, number][] = [];
    const pointPcts: number[] = [];
    let cumDist = 0;
    for (const point of trip.points) {
      pointPcts.push(cumDist);
      if (point.polyline_to_next) {
        const seg = decodeAmapPolyline(point.polyline_to_next);
        for (let i = 0; i < seg.length; i += 3) path.push(seg[i]);
      }
      if (point.distance_to_next) cumDist += point.distance_to_next;
    }
    // Convert to 0-1 percentages, with a tiny offset so labels appear just before the pulse arrives
    const offset = 0.003;
    for (let i = 0; i < pointPcts.length; i++) {
      pointPcts[i] = cumDist > 0 ? Math.max(0, pointPcts[i] / cumDist - offset) : 0;
    }
    if (path.length < 2) return;

    // Hide markers, show labels on timer
    markers.forEach((m) => m.setMap(null));
    setIsReplaying(true);
    setHovered(null);

    // Loca pulse line
    const loca = new LocaLib.Container({ map });
    const geo = new LocaLib.GeoJSONSource({
      data: {
        type: "FeatureCollection",
        features: [{
          type: "Feature",
          geometry: { type: "LineString", coordinates: path },
          properties: {},
        }],
      },
    });
    const layer = new LocaLib.PulseLineLayer({
      zIndex: 10, opacity: 1, visible: true, zooms: [2, 22],
    });
    layer.setSource(geo);
    layer.setStyle({
      altitude: 0, lineWidth: 5,
      headColor: "#fbbf24",
      trailColor: "rgba(59, 130, 246, 0.4)",
      interval: 1, duration: 180000,
    });
    loca.add(layer);
    loca.animate.start();

    // Show labels at correct time
    const totalMs = 180000;
    const startTime = Date.now();
    let shownCount = 0;

    const labelTimer = setInterval(() => {
      const progress = Math.min((Date.now() - startTime) / totalMs, 1);
      for (let i = shownCount; i < trip.points.length; i++) {
        if (progress >= pointPcts[i]) {
          const m = markers[i];
          if (m) {
            m.setMap(map);
            const labelEl = document.createElement("div");
            labelEl.innerHTML = `<div style="background:rgba(0,0,0,0.8);color:#fff;padding:3px 10px;border-radius:6px;font-size:13px;font-weight:600;white-space:nowrap;transform:translate(-50%,-160%);">${trip.points[i].title}</div>`;
            m.setContent(labelEl);
          }
          shownCount = i + 1;
        } else {
          break;
        }
      }
      if (progress >= 1) {
        clearInterval(labelTimer);
        // Destroy loca, restore markers
        loca.destroy();
        stopReplay();
      }
    }, 400);

    replayTimerRef.current = labelTimer;
    replayMarkerRef.current = {
      setMap(m: AMap.Map | null) { if (!m) loca.destroy(); },
    } as unknown as AMap.Marker;
  };

  const stopReplay = () => {
    if (replayTimerRef.current) {
      clearInterval(replayTimerRef.current);
      replayTimerRef.current = null;
    }
    if (replayMarkerRef.current) {
      replayMarkerRef.current.setMap(null);
      replayMarkerRef.current = null;
    }
    // Restore all markers with original content
    const map = mapInstanceRef.current;
    if (map && trip) {
      const z = map.getZoom();
      const lastIdx = allMarkersRef.current.length - 1;
      allMarkersRef.current.forEach((m, i) => {
        if (!trip.points[i]) return;
        const isLast = i === lastIdx;
        const el = document.createElement("div");
        el.innerHTML = buildMarkerHtml(i + 1, trip.points[i].point_type, isLast);
        m.setContent(el);
        // Re-apply zoom visibility (first/last always visible)
        if (i === 0 || i === lastIdx) { m.setMap(map); }
        else if (z <= 5) m.setMap(i % 4 === 0 ? map : null);
        else if (z <= 7) m.setMap(i % 2 === 0 ? map : null);
        else m.setMap(map);
      });
    }
    setIsReplaying(false);
  };

  // Clean up replay on unmount
  useEffect(() => {
    return () => {
      if (replayTimerRef.current) clearInterval(replayTimerRef.current);
      if (replayMarkerRef.current) replayMarkerRef.current.setMap(null);
    };
  }, []);

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">加载中...</p>
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-background text-muted-foreground">
        <MapPin className="size-10" />
        <p>行程不存在</p>
        <Button variant="outline" size="sm" onClick={() => router.push("/trips")}>返回列表</Button>
      </div>
    );
  }

  const dayMap = groupByDay(trip.points);
  const dayKeys = Array.from(dayMap.keys());

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Map */}
      <div className="flex-1 relative">
        <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

        {/* Top overlay */}
        <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-background/90 via-background/60 to-transparent pb-4 pt-3 px-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 bg-background/70 backdrop-blur-sm shadow-sm"
              onClick={() => router.push("/trips")}
              aria-label="返回列表"
            >
              <ArrowLeft className="size-5" />
            </Button>
            <Button
              variant={isReplaying ? "default" : "outline"}
              size="sm"
              className="shrink-0 gap-1 bg-background/70 backdrop-blur-sm shadow-sm"
              onClick={isReplaying ? stopReplay : startReplay}
            >
              {isReplaying ? <Square className="size-3.5" /> : <Play className="size-3.5" />}
              {isReplaying ? "停止" : "回放"}
            </Button>
            <div className="min-w-0">
              <h1 className="text-lg font-bold truncate">{trip.title}</h1>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mt-0.5">
                {trip.start_date && (
                  <span className="flex items-center gap-1">
                    <Calendar className="size-3" /> {trip.start_date} ~ {trip.end_date || "至今"}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <MapPin className="size-3" /> {trip.point_count} 点
                </span>
                <span className="flex items-center gap-1">
                  <Navigation className="size-3" /> {formatDist(trip.total_distance)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Hover info card — positioned above marker */}
        {hovered && (
          <div
            className="absolute z-20 w-64 rounded-lg border bg-card/95 backdrop-blur-sm shadow-lg p-3 pointer-events-none"
            style={{
              left: Math.min(hovered.x - 128, containerRef.current!.clientWidth - 272),
              top: hovered.y - 16,
              transform: "translateY(-100%)",
            }}
          >
            <div className="flex items-center gap-2">
              <span
                className="size-2.5 rounded-full shrink-0"
                style={{ backgroundColor: (POINT_TYPE_META[hovered.point.point_type] ?? POINT_TYPE_META.other).color }}
              />
              <h3 className="font-semibold text-sm">{hovered.point.title}</h3>
              <Badge variant="secondary" className="text-[10px] ml-auto">
                {(POINT_TYPE_META[hovered.point.point_type] ?? POINT_TYPE_META.other).label}
              </Badge>
            </div>
            {hovered.point.location_name && (
              <p className="mt-1 text-xs text-muted-foreground">{hovered.point.location_name}</p>
            )}
            {hovered.point.arrived_at && (
              <p className="text-xs text-muted-foreground">
                {new Date(hovered.point.arrived_at).toLocaleString("zh-CN")}
              </p>
            )}
            {hovered.point.distance_to_next != null && (
              <p className="text-xs text-muted-foreground">距下一点 {formatDist(hovered.point.distance_to_next)}</p>
            )}
            {hovered.point.description && (
              <p className="mt-1 text-xs line-clamp-2">{hovered.point.description}</p>
            )}
          </div>
        )}
      </div>

      {/* Bottom timeline */}
      <div className="px-4 pb-4 pt-1">
        <div className="flex items-center gap-2 overflow-x-auto rounded-full bg-background/80 backdrop-blur-sm border shadow-sm px-3 py-2">
          {dayKeys.map((day, idx) => {
            const dayPoints = dayMap.get(day)!;
            const color = DAY_COLORS[idx % DAY_COLORS.length];
            const label = day !== "unknown" ? `Day ${idx + 1} · ${day.slice(5)}` : "未知";
            return (
              <button
                key={day}
                type="button"
                className="flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-xs transition-colors hover:bg-muted"
                onClick={() => {
                  const first = dayPoints.find((p) => p.latitude != null);
                  if (first && mapInstanceRef.current) {
                    mapInstanceRef.current.setZoomAndCenter(10, [first.longitude!, first.latitude!], false, 600);
                  }
                }}
              >
                <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                <span>{label}</span>
                <span className="text-muted-foreground">{dayPoints.length}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function decodeAmapPolyline(encoded: string): [number, number][] {
  if (!encoded) return [];
  if (encoded.includes(";") && !encoded.startsWith("[")) {
    return encoded.split(";").map((pair) => {
      const [lng, lat] = pair.split(",").map(Number);
      return [lng, lat] as [number, number];
    });
  }
  let index = 0;
  const points: [number, number][] = [];
  let lat = 0, lng = 0;
  while (index < encoded.length) {
    let b: number, shift = 0, result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) !== 0 ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += (result & 1) !== 0 ? ~(result >> 1) : (result >> 1);
    points.push([lng * 1e-5, lat * 1e-5]);
  }
  return points;
}
