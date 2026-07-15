declare module "@amap/amap-jsapi-loader" {
  interface AMapLoaderOptions {
    key: string;
    version: string;
    plugins?: string[];
  }

  interface AMapLoader {
    load(options: AMapLoaderOptions): Promise<typeof AMap>;
  }

  const loader: {
    default: AMapLoader;
  };
  export default loader;
}

declare namespace AMap {
  class Map {
    constructor(container: HTMLElement | string, options?: MapOptions);
    destroy(): void;
    setZoomAndCenter(
      zoom: number,
      center: [number, number],
      immediately?: boolean,
      duration?: number
    ): void;
    setFitView(
      overlays: Overlay[],
      immediately?: boolean,
      avoid?: [number, number, number, number]
    ): void;
    add(overlay: Overlay | Overlay[]): void;
    remove(overlay: Overlay | Overlay[]): void;
    getCenter(): LngLat;
    getZoom(): number;
    setCenter(center: [number, number], immediately?: boolean): void;
    lngLatToContainer(lnglat: [number, number]): Pixel;
    on(event: string, handler: (...args: unknown[]) => void): void;
  }

  interface MapOptions {
    zoom?: number;
    center?: [number, number];
    mapStyle?: string;
    features?: string[];
    layers?: unknown[];
    viewMode?: string;
  }

  class LngLat {
    constructor(lng: number, lat: number);
    lng: number;
    lat: number;
    offset(w: number, n: number): LngLat;
    distance(lnglat: LngLat): number;
  }

  class Pixel {
    constructor(x: number, y: number);
    x: number;
    y: number;
  }

  class Marker {
    constructor(options?: MarkerOptions);
    on(event: string, handler: (e: unknown) => void): void;
    setPosition(position: [number, number]): void;
    getPosition(): LngLat;
    setContent(content: HTMLElement | string): void;
    setMap(map: Map | null): void;
    moveAlong(
      path: [number, number][],
      speed: number,
      callback?: (progress: number) => void,
      circular?: boolean
    ): void;
    stopMove(): void;
  }

  interface MarkerOptions {
    position?: [number, number];
    content?: HTMLElement | string;
    anchor?: string;
    offset?: Pixel;
    icon?: unknown;
    zIndex?: number;
  }

  class Polyline {
    constructor(options?: PolylineOptions);
  }

  interface PolylineOptions {
    path?: [number, number][];
    strokeColor?: string;
    strokeWeight?: number;
    strokeOpacity?: number;
    lineJoin?: string;
    lineCap?: string;
    zIndex?: number;
  }

  type Overlay = Marker | Polyline;
}

declare namespace Loca {
  class Container {
    constructor(options: { map: AMap.Map });
    add(layer: Layer): void;
    remove(layer: Layer): void;
    destroy(): void;
    animate: { start(): void; stop(): void };
  }

  class GeoJSONSource {
    constructor(options: { data: GeoJSON.FeatureCollection });
  }

  class PulseLineLayer {
    constructor(options?: {
      zIndex?: number;
      opacity?: number;
      visible?: boolean;
      zooms?: [number, number];
    });
    setSource(source: GeoJSONSource): void;
    setStyle(style: PulseLineStyle): void;
  }

  interface PulseLineStyle {
    altitude?: number;
    lineWidth?: number;
    headColor?: string;
    trailColor?: string;
    interval?: number;
    duration?: number;
  }

  type Layer = PulseLineLayer;
}

interface Window {
  Loca?: typeof Loca;
}

declare namespace AMap {
  class DistrictSearch {
    constructor(options: DistrictSearchOptions);
    search(
      keyword: string,
      callback: (status: string, result: DistrictSearchResult) => void
    ): void;
  }

  interface DistrictSearchOptions {
    level?: string;
    subdistrict?: number;
    extensions?: string;
  }

  interface DistrictSearchResult {
    districtList: DistrictItem[];
  }

  interface DistrictItem {
    name: string;
    level: string;
    boundaries?: [number, number][][];
    districtList?: DistrictItem[];
  }

  class GeometryUtil {
    static decodePath(encoded: string): [number, number][];
  }

  function plugin(
    plugins: string | string[],
    callback: () => void
  ): void;

}
