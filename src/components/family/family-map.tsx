"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Navigation, NavigationOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useLockTouchGestures } from "@/hooks/use-lock-touch-gestures";
import { cn } from "@/lib/utils";
import type { Member } from "@/types/database";

type MarkerItem = {
  id: string;
  lat: number;
  lng: number;
  title: string;
  subtitle: string;
};

type Props = {
  members: Member[];
};

type LatLng = { lat: number; lng: number };

type LeafletMarker = {
  addTo: (map: unknown) => LeafletMarker;
  bindPopup: (html: string) => LeafletMarker;
  setLatLng: (latlng: [number, number]) => void;
  remove: () => void;
};

type LeafletMap = {
  remove: () => void;
  fitBounds: (bounds: unknown, opts?: { padding?: [number, number]; maxZoom?: number }) => void;
  setView: (center: [number, number], zoom?: number) => void;
  panTo: (center: [number, number]) => void;
  invalidateSize: () => void;
};

type LeafletModule = {
  map: (
    el: HTMLElement,
    opts?: { attributionControl?: boolean; zoomControl?: boolean },
  ) => LeafletMap & { addLayer: (layer: unknown) => void };
  tileLayer: (
    url: string,
    opts?: { attribution?: string; maxZoom?: number },
  ) => { addTo: (map: unknown) => void };
  marker: (latlng: [number, number], opts?: { icon?: unknown }) => LeafletMarker;
  circleMarker: (
    latlng: [number, number],
    opts?: {
      radius?: number;
      color?: string;
      fillColor?: string;
      fillOpacity?: number;
      weight?: number;
    },
  ) => LeafletMarker;
  divIcon: (opts: {
    className?: string;
    html?: string;
    iconSize?: [number, number];
    iconAnchor?: [number, number];
  }) => unknown;
  featureGroup: (layers: unknown[]) => { getBounds: () => unknown };
  Icon: {
    Default: {
      prototype: Record<string, unknown>;
      mergeOptions: (opts: Record<string, string>) => void;
    };
  };
};

declare global {
  interface Window {
    L?: LeafletModule;
  }
}

/** Bán kính (mét) coi như đã đến điểm đánh dấu */
const ARRIVE_RADIUS_M = 45;

function loadLeaflet(): Promise<LeafletModule> {
  return new Promise((resolve, reject) => {
    if (window.L) {
      resolve(window.L);
      return;
    }

    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }

    const onReady = () => {
      if (!window.L) {
        reject(new Error("Leaflet không sẵn sàng"));
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window.L.Icon.Default.prototype as any)._getIconUrl;
      window.L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });
      resolve(window.L);
    };

    const existing = document.getElementById("leaflet-js") as HTMLScriptElement | null;
    if (existing) {
      if (window.L) onReady();
      else existing.addEventListener("load", onReady, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = "leaflet-js";
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.async = true;
    script.onload = onReady;
    script.onerror = () => reject(new Error("Không tải được bản đồ"));
    document.body.appendChild(script);
  });
}

function haversineMeters(a: LatLng, b: LatLng) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function formatDistance(meters: number) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function FamilyMap({ members }: Props) {
  const mapRef = useLockTouchGestures<HTMLDivElement>();
  const mapElRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<LeafletMap | null>(null);
  const leafletRef = useRef<LeafletModule | null>(null);
  const meMarkerRef = useRef<LeafletMarker | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const completedRef = useRef<Set<string>>(new Set());

  const [error, setError] = useState<string | null>(null);
  const [tracking, setTracking] = useState(true);
  const [myPos, setMyPos] = useState<LatLng | null>(null);
  const [gpsStatus, setGpsStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [completed, setCompleted] = useState<Set<string>>(() => new Set());
  const [followMe, setFollowMe] = useState(false);
  const fittedWithMeRef = useRef(false);
  const followMeRef = useRef(followMe);
  followMeRef.current = followMe;

  const markers = useMemo(() => {
    const items: MarkerItem[] = [];
    for (const m of members) {
      if (m.current_lat != null && m.current_lng != null) {
        items.push({
          id: `${m.id}-current`,
          lat: m.current_lat,
          lng: m.current_lng,
          title: m.full_name,
          subtitle: m.current_place ?? "Vị trí đã lưu (GPS)",
        });
      } else if (m.birth_lat != null && m.birth_lng != null) {
        items.push({
          id: `${m.id}-birth`,
          lat: m.birth_lat,
          lng: m.birth_lng,
          title: m.full_name,
          subtitle: `Nơi sinh: ${m.birth_place ?? "—"}`,
        });
      } else if (m.death_lat != null && m.death_lng != null) {
        items.push({
          id: `${m.id}-death`,
          lat: m.death_lat,
          lng: m.death_lng,
          title: m.full_name,
          subtitle: `Nơi mất: ${m.death_place ?? "—"}`,
        });
      }
    }
    return items;
  }, [members]);

  const distances = useMemo(() => {
    if (!myPos) return new Map<string, number>();
    const map = new Map<string, number>();
    for (const m of markers) {
      map.set(m.id, haversineMeters(myPos, { lat: m.lat, lng: m.lng }));
    }
    return map;
  }, [myPos, markers]);

  const checkArrivals = useCallback(
    (pos: LatLng) => {
      for (const m of markers) {
        if (completedRef.current.has(m.id)) continue;
        const d = haversineMeters(pos, { lat: m.lat, lng: m.lng });
        if (d <= ARRIVE_RADIUS_M) {
          completedRef.current.add(m.id);
          setCompleted(new Set(completedRef.current));
          toast.success(`Hoàn thành: đã đến vị trí ${m.title}`);
        }
      }
    },
    [markers],
  );

  const updateMeMarker = useCallback((pos: LatLng) => {
    const L = leafletRef.current;
    const map = mapInstanceRef.current;
    if (!L || !map) return;

    if (!meMarkerRef.current) {
      const icon = L.divIcon({
        className: "",
        iconSize: [22, 22],
        iconAnchor: [11, 11],
        html: `<div style="width:22px;height:22px;border-radius:9999px;background:#2563eb;border:3px solid #fff;box-shadow:0 0 0 2px rgba(37,99,235,.35)"></div>`,
      });
      meMarkerRef.current = L.marker([pos.lat, pos.lng], { icon })
        .addTo(map)
        .bindPopup("<strong>Vị trí của bạn</strong>");
    } else {
      meMarkerRef.current.setLatLng([pos.lat, pos.lng]);
    }

    // Lần đầu có GPS: phóng để thấy cả ghim + vị trí bạn
    if (!fittedWithMeRef.current && markers.length > 0) {
      fittedWithMeRef.current = true;
      const boundLayers = [
        ...markers.map((m) => L.marker([m.lat, m.lng])),
        L.marker([pos.lat, pos.lng]),
      ];
      const group = L.featureGroup(boundLayers);
      map.fitBounds(group.getBounds(), { padding: [48, 48], maxZoom: 16 });
    }
  }, [markers]);

  // Init map + place markers
  useEffect(() => {
    if (markers.length === 0 || !mapElRef.current) return;

    let cancelled = false;

    void (async () => {
      try {
        const L = await loadLeaflet();
        if (cancelled || !mapElRef.current) return;

        leafletRef.current = L;
        mapInstanceRef.current?.remove();
        mapInstanceRef.current = null;
        meMarkerRef.current = null;
        fittedWithMeRef.current = false;

        const map = L.map(mapElRef.current, { attributionControl: true });
        mapInstanceRef.current = map;

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        }).addTo(map);

        const layers = markers.map((m) => {
          const done = completedRef.current.has(m.id);
          const marker = L.marker([m.lat, m.lng]);
          marker.bindPopup(
            `<strong>${escapeHtml(m.title)}</strong><br/><span style="font-size:12px;color:#555">${escapeHtml(m.subtitle)}</span>${done ? "<br/><span style='color:#16a34a;font-weight:600'>✓ Hoàn thành</span>" : ""}`,
          );
          marker.addTo(map);
          return marker;
        });

        if (layers.length === 1) {
          map.setView([markers[0].lat, markers[0].lng], 15);
        } else {
          const group = L.featureGroup(layers);
          map.fitBounds(group.getBounds(), { padding: [40, 40], maxZoom: 16 });
        }
        requestAnimationFrame(() => map.invalidateSize());
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Không mở được bản đồ");
      }
    })();

    return () => {
      cancelled = true;
      mapInstanceRef.current?.remove();
      mapInstanceRef.current = null;
      meMarkerRef.current = null;
      leafletRef.current = null;
    };
  }, [markers]);

  // Live GPS: lấy nhanh 1 lần rồi mới theo dõi liên tục
  useEffect(() => {
    if (!tracking) {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setGpsStatus((s) => (s === "ready" ? "idle" : s));
      return;
    }

    if (!navigator.geolocation) {
      toast.error("Trình duyệt không hỗ trợ định vị");
      setTracking(false);
      setGpsStatus("error");
      return;
    }

    let cancelled = false;
    let gotPos = false;
    setGpsStatus("loading");

    const onPos = (pos: GeolocationPosition) => {
      if (cancelled) return;
      gotPos = true;
      const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setMyPos(next);
      setGpsStatus("ready");
      updateMeMarker(next);
      checkArrivals(next);
      if (followMeRef.current && mapInstanceRef.current) {
        mapInstanceRef.current.panTo([next.lat, next.lng]);
      }
    };

    const onFail = (err: GeolocationPositionError) => {
      if (cancelled || gotPos) return;
      setGpsStatus("error");
      if (err.code === err.PERMISSION_DENIED) {
        toast.error("Cần cho phép truy cập vị trí");
        setTracking(false);
      } else {
        toast.error("Không lấy được GPS — bấm bật lại để thử");
        setTracking(false);
      }
    };

    // 1) Lấy vị trí nhanh (không bắt buộc GPS vệ tinh)
    navigator.geolocation.getCurrentPosition(onPos, () => {
      navigator.geolocation.getCurrentPosition(onPos, onFail, {
        enableHighAccuracy: false,
        timeout: 8000,
        maximumAge: 60000,
      });
    }, {
      enableHighAccuracy: false,
      timeout: 8000,
      maximumAge: 15000,
    });

    // 2) Theo dõi khi di chuyển
    watchIdRef.current = navigator.geolocation.watchPosition(onPos, () => {
      // Không tắt tracking nếu watch lỗi tạm thời — đã có vị trí từ bước 1
    }, {
      enableHighAccuracy: false,
      timeout: 15000,
      maximumAge: 5000,
    });

    const safety = window.setTimeout(() => {
      if (cancelled || gotPos) return;
      toast.error("Hết thời gian lấy GPS");
      setGpsStatus("error");
      setTracking(false);
    }, 12000);

    return () => {
      cancelled = true;
      window.clearTimeout(safety);
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [tracking, updateMeMarker, checkArrivals]);

  // Keep me marker when map remounts while tracking
  useEffect(() => {
    if (tracking && myPos) updateMeMarker(myPos);
  }, [tracking, myPos, updateMeMarker, markers]);

  function toggleTracking() {
    if (tracking) {
      setTracking(false);
      meMarkerRef.current?.remove();
      meMarkerRef.current = null;
      setMyPos(null);
      setGpsStatus("idle");
      fittedWithMeRef.current = false;
      return;
    }
    setTracking(true);
    setGpsStatus("loading");
  }

  if (markers.length === 0) {
    return (
      <div className="rounded-md border border-border bg-card p-10 text-center text-sm text-muted-foreground">
        Chưa có vị trí trên bản đồ. Khi sửa thành viên, bấm <strong>Định vị GPS</strong> rồi{" "}
        <strong>Lưu / Cập nhật</strong> để gắn vị trí người đó.
      </div>
    );
  }

  const doneCount = markers.filter((m) => completed.has(m.id)).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={tracking ? "secondary" : "default"}
          onClick={toggleTracking}
        >
          {tracking ? (
            <>
              <NavigationOff className="h-4 w-4" />
              Tắt vị trí của tôi
            </>
          ) : (
            <>
              <Navigation className="h-4 w-4" />
              Bật vị trí của tôi
            </>
          )}
        </Button>
        {tracking && (
          <Button
            type="button"
            size="sm"
            variant={followMe ? "default" : "outline"}
            onClick={() => setFollowMe((v) => !v)}
          >
            {followMe ? "Đang theo tôi" : "Theo tôi"}
          </Button>
        )}
        <p className="text-sm text-muted-foreground">
          {markers.length} điểm ghim
          {gpsStatus === "ready" && myPos
            ? " · đang hiện vị trí của bạn"
            : gpsStatus === "loading"
              ? " · đang lấy GPS..."
              : gpsStatus === "error"
                ? " · GPS lỗi"
                : ""}
          {" · "}
          {doneCount}/{markers.length} hoàn thành
        </p>
      </div>

      <p className="text-xs text-muted-foreground">
        Ghim = nơi đã lưu. <span className="font-medium text-foreground">Chấm xanh</span> = vị trí
        bạn (đi theo khi bạn di chuyển). Đến gần ~{ARRIVE_RADIUS_M}m sẽ báo hoàn thành.
      </p>

      {error && (
        <p className="rounded-md border border-border bg-card px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div
        ref={mapRef}
        className="h-[min(75vh,640px)] touch-none overscroll-none overflow-hidden rounded-md border border-border sm:h-[640px]"
        style={{ touchAction: "none" }}
      >
        <div ref={mapElRef} className="h-full w-full" />
      </div>

      <ul className="space-y-2 text-sm">
        {markers.map((m) => {
          const done = completed.has(m.id);
          const dist = distances.get(m.id);
          return (
            <li
              key={m.id}
              className={cn(
                "rounded-md border px-3 py-2",
                done ? "border-primary/40 bg-primary/5" : "border-border bg-card",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{m.title}</p>
                  <p className="text-xs text-muted-foreground">{m.subtitle}</p>
                  {dist != null && (
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Cách bạn ~{formatDistance(dist)}
                    </p>
                  )}
                </div>
                {done && (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary/15 px-2 py-1 text-xs font-medium text-primary">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Hoàn thành
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
