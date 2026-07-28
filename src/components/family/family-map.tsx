"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Navigation, NavigationOff, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLockTouchGestures } from "@/hooks/use-lock-touch-gestures";
import { useSmoothLocation } from "@/hooks/useSmoothLocation";
import {
  loadTrackAsiaGl,
  trackAsiaStyleUrl,
  type TrackAsiaGl,
  type TrackAsiaMap,
  type TrackAsiaMarker,
} from "@/lib/trackasia";
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

/** Mét — coi như đã đến gần điểm ghim */
const NEAR_RADIUS_M = 50;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
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

function pinDotHtml(selected: boolean) {
  const size = selected ? 36 : 22;
  const color = selected ? "#46573f" : "#8a7a5a";
  const ring = selected ? "0 0 0 4px rgba(70,87,63,.28)" : "0 1px 4px rgba(0,0,0,.35)";
  return `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${color};border:3px solid #fff;box-shadow:${ring};"></div>`;
}

/** Chấm xanh + mũi tên heading (xoay bằng CSS) */
function makeMeMarkerEl() {
  const wrap = document.createElement("div");
  wrap.style.cssText =
    "position:relative;width:28px;height:28px;cursor:pointer;display:flex;align-items:center;justify-content:center;";
  wrap.innerHTML = `
    <div data-me-rot style="
      width:28px;height:28px;
      display:flex;align-items:center;justify-content:center;
      transition:transform 0.35s ease-out;
      will-change:transform;
    ">
      <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
        <circle cx="14" cy="14" r="8" fill="#2563eb" stroke="#fff" stroke-width="3"/>
        <path d="M14 3 L17.5 11 L14 9.5 L10.5 11 Z" fill="#2563eb" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/>
      </svg>
    </div>
    <div style="
      position:absolute;inset:0;border-radius:9999px;
      box-shadow:0 0 0 3px rgba(37,99,235,.28);pointer-events:none;
    "></div>
  `;
  return wrap;
}

function setMeMarkerHeading(el: HTMLElement, heading: number | null) {
  const rot = el.querySelector("[data-me-rot]") as HTMLElement | null;
  if (!rot) return;
  if (heading == null || !Number.isFinite(heading)) return;
  rot.style.transform = `rotate(${heading}deg)`;
}

function makeDotEl(html: string) {
  const el = document.createElement("div");
  el.style.cursor = "pointer";
  el.innerHTML = html;
  return el;
}

function fitPoints(map: TrackAsiaMap, points: LatLng[], padding = 48, maxZoom = 16) {
  if (points.length === 0) return;
  if (points.length === 1) {
    map.flyTo({ center: [points[0].lng, points[0].lat], zoom: 15 });
    return;
  }
  let minLng = points[0].lng;
  let maxLng = points[0].lng;
  let minLat = points[0].lat;
  let maxLat = points[0].lat;
  for (const p of points) {
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
  }
  map.fitBounds(
    [
      [minLng, minLat],
      [maxLng, maxLat],
    ],
    { padding, maxZoom },
  );
}

export function FamilyMap({ members }: Props) {
  const mapRef = useLockTouchGestures<HTMLDivElement>();
  const mapElRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<TrackAsiaMap | null>(null);
  const glRef = useRef<TrackAsiaGl | null>(null);
  const markerRefs = useRef<Map<string, TrackAsiaMarker>>(new Map());
  const meMarkerRef = useRef<TrackAsiaMarker | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const nearNotifiedRef = useRef<Set<string>>(new Set());
  const fittedWithMeRef = useRef(false);
  const toastGpsRef = useRef(false);

  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tracking, setTracking] = useState(true);
  const [nearIds, setNearIds] = useState<Set<string>>(() => new Set());
  const [searchQuery, setSearchQuery] = useState("");

  const {
    position: myPos,
    accuracy,
    heading,
    isReady,
    error: gpsError,
  } = useSmoothLocation({ enabled: tracking });

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

  const filteredMarkers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return markers;
    return markers.filter(
      (m) =>
        m.title.toLowerCase().includes(q) || m.subtitle.toLowerCase().includes(q),
    );
  }, [markers, searchQuery]);

  const distances = useMemo(() => {
    if (!myPos) return new Map<string, number>();
    const map = new Map<string, number>();
    for (const m of markers) {
      map.set(m.id, haversineMeters(myPos, { lat: m.lat, lng: m.lng }));
    }
    return map;
  }, [myPos, markers]);

  const listMarkers = useMemo(() => {
    if (!myPos) return filteredMarkers;
    return [...filteredMarkers].sort(
      (a, b) => (distances.get(a.id) ?? 1e12) - (distances.get(b.id) ?? 1e12),
    );
  }, [filteredMarkers, distances, myPos]);

  // Ẩn / hiện ghim theo bộ lọc tìm kiếm
  useEffect(() => {
    const q = searchQuery.trim().toLowerCase();
    for (const [id, marker] of markerRefs.current) {
      const item = markers.find((m) => m.id === id);
      const match =
        !q ||
        !item ||
        item.title.toLowerCase().includes(q) ||
        item.subtitle.toLowerCase().includes(q);
      const el = marker.getElement();
      el.style.opacity = match ? "1" : "0.22";
      el.style.pointerEvents = match ? "auto" : "none";
    }
  }, [searchQuery, markers]);

  // Khi lọc còn vài điểm → zoom vừa khung
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || filteredMarkers.length === 0) return;
    if (!searchQuery.trim()) return;
    if (filteredMarkers.length === 1) {
      map.flyTo({
        center: [filteredMarkers[0].lng, filteredMarkers[0].lat],
        zoom: 15,
      });
      return;
    }
    fitPoints(map, filteredMarkers, 56, 15);
  }, [filteredMarkers, searchQuery]);

  const applyMarkerStyles = useCallback((activeId: string | null) => {
    for (const [id, marker] of markerRefs.current) {
      const selected = id === activeId;
      marker.getElement().innerHTML = pinDotHtml(selected);
    }
  }, []);

  const updateMeMarker = useCallback(
    (pos: LatLng, headingDeg: number | null) => {
      const gl = glRef.current;
      const map = mapInstanceRef.current;
      if (!gl || !map) return;

      if (!meMarkerRef.current) {
        const el = makeMeMarkerEl();
        setMeMarkerHeading(el, headingDeg);
        const marker = new gl.Marker({ element: el, anchor: "center" })
          .setLngLat([pos.lng, pos.lat])
          .setPopup(new gl.Popup({ offset: 14 }).setHTML("<strong>Vị trí của bạn</strong>"))
          .addTo(map);
        meMarkerRef.current = marker;
      } else {
        meMarkerRef.current.setLngLat([pos.lng, pos.lat]);
        setMeMarkerHeading(meMarkerRef.current.getElement(), headingDeg);
      }

      if (!fittedWithMeRef.current && markers.length > 0) {
        fittedWithMeRef.current = true;
        fitPoints(map, [...markers, pos]);
      }
    },
    [markers],
  );

  const checkNearPins = useCallback(
    (pos: LatLng) => {
      const nextNear = new Set<string>();
      for (const m of markers) {
        const d = haversineMeters(pos, { lat: m.lat, lng: m.lng });
        if (d <= NEAR_RADIUS_M) {
          nextNear.add(m.id);
          if (!nearNotifiedRef.current.has(m.id)) {
            nearNotifiedRef.current.add(m.id);
            toast.success(`Bạn đang gần: ${m.title}`);
            selectedIdRef.current = m.id;
            setSelectedId(m.id);
            applyMarkerStyles(m.id);
            markerRefs.current.get(m.id)?.togglePopup();
          }
        }
      }
      setNearIds(nextNear);
    },
    [markers, applyMarkerStyles],
  );

  const focusMarker = (id: string) => {
    const item = markers.find((m) => m.id === id);
    const marker = markerRefs.current.get(id);
    const map = mapInstanceRef.current;
    if (!item || !marker || !map) return;

    selectedIdRef.current = id;
    setSelectedId(id);
    applyMarkerStyles(id);
    map.flyTo({ center: [item.lng, item.lat], zoom: 16 });
    marker.togglePopup();
  };

  // Init TrackAsia map + pins
  useEffect(() => {
    if (markers.length === 0 || !mapElRef.current) return;

    let cancelled = false;

    void (async () => {
      try {
        const gl = await loadTrackAsiaGl();
        if (cancelled || !mapElRef.current) return;

        glRef.current = gl;
        mapInstanceRef.current?.remove();
        mapInstanceRef.current = null;
        markerRefs.current.clear();
        meMarkerRef.current = null;
        fittedWithMeRef.current = false;

        const first = markers[0];
        const map = new gl.Map({
          container: mapElRef.current,
          style: trackAsiaStyleUrl("v1"),
          center: [first.lng, first.lat],
          zoom: 12,
          attributionControl: true,
        });
        mapInstanceRef.current = map;
        map.addControl(new gl.NavigationControl({ showCompass: false }), "top-right");

        const placeMarkers = () => {
          if (cancelled) return;

          for (const m of markers) {
            const selected = m.id === selectedIdRef.current;
            const marker = new gl.Marker({
              element: makeDotEl(pinDotHtml(selected)),
              anchor: "center",
            })
              .setLngLat([m.lng, m.lat])
              .setPopup(
                new gl.Popup({ offset: 14 }).setHTML(
                  `<strong>${escapeHtml(m.title)}</strong><br/><span style="font-size:12px;color:#555">${escapeHtml(m.subtitle)}</span>`,
                ),
              )
              .addTo(map);

            marker.getElement().addEventListener("click", () => {
              selectedIdRef.current = m.id;
              setSelectedId(m.id);
              applyMarkerStyles(m.id);
              map.flyTo({ center: [m.lng, m.lat], zoom: 16 });
            });

            markerRefs.current.set(m.id, marker);
          }

          const active = selectedIdRef.current
            ? markers.find((m) => m.id === selectedIdRef.current)
            : null;

          if (active) {
            map.flyTo({ center: [active.lng, active.lat], zoom: 16 });
            markerRefs.current.get(active.id)?.togglePopup();
          } else {
            fitPoints(map, markers, 40, 16);
          }

          requestAnimationFrame(() => map.resize());
        };

        map.on("load", placeMarkers);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Không mở được bản đồ TrackAsia");
      }
    })();

    return () => {
      cancelled = true;
      mapInstanceRef.current?.remove();
      mapInstanceRef.current = null;
      markerRefs.current.clear();
      meMarkerRef.current = null;
      glRef.current = null;
    };
  }, [markers, applyMarkerStyles]);

  // Đồng bộ marker + báo gần từ hook GPS mượt
  useEffect(() => {
    if (!tracking || !myPos) return;
    updateMeMarker(myPos, heading);
    checkNearPins(myPos);
  }, [tracking, myPos, heading, updateMeMarker, checkNearPins]);

  // Toast lỗi GPS (một lần mỗi phiên bật)
  useEffect(() => {
    if (!tracking) {
      toastGpsRef.current = false;
      return;
    }
    if (!gpsError || toastGpsRef.current) return;
    toastGpsRef.current = true;
    if (gpsError.code === gpsError.PERMISSION_DENIED) {
      toast.error("Cần cho phép truy cập vị trí");
      setTracking(false);
    } else {
      toast.error("Không lấy được GPS");
    }
  }, [gpsError, tracking]);

  function toggleTracking() {
    if (tracking) {
      setTracking(false);
      meMarkerRef.current?.remove();
      meMarkerRef.current = null;
      setNearIds(new Set());
      fittedWithMeRef.current = false;
      return;
    }
    nearNotifiedRef.current.clear();
    toastGpsRef.current = false;
    setTracking(true);
  }

  const gpsLabel = !tracking
    ? ""
    : gpsError
      ? " · GPS lỗi"
      : !myPos
        ? " · đang lấy GPS..."
        : isReady
          ? " · GPS ổn định"
          : accuracy != null
            ? ` · ±${Math.round(accuracy)}m`
            : " · đang làm mượt...";

  if (markers.length === 0) {
    return (
      <div className="rounded-md border border-border bg-card p-10 text-center text-sm text-muted-foreground">
        Chưa có vị trí trên bản đồ. Khi sửa thành viên, bấm <strong>Định vị GPS</strong> rồi{" "}
        <strong>Lưu / Cập nhật</strong> để gắn vị trí người đó.
      </div>
    );
  }

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
        <p className="text-sm text-muted-foreground">
          TrackAsia · {filteredMarkers.length}
          {searchQuery.trim() ? `/${markers.length}` : ""} điểm ghim
          {gpsLabel}
        </p>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="h-9 pl-8 pr-8 text-sm"
          placeholder="Tìm theo tên hoặc địa chỉ trên bản đồ..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Tìm điểm trên bản đồ"
        />
        {searchQuery && (
          <button
            type="button"
            aria-label="Xóa tìm kiếm"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
            onClick={() => setSearchQuery("")}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        GPS đã lọc nhiễu + làm mượt. Chấm xanh + mũi tên = bạn. Đến trong ~
        {NEAR_RADIUS_M}m sẽ báo gần điểm ghim. Gõ tên để lọc danh sách và làm mờ điểm khác.
      </p>

      {error && (
        <p className="rounded-md border border-border bg-card px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div
        ref={mapRef}
        className="h-[min(60vh,480px)] touch-none overscroll-none overflow-hidden rounded-md border border-border sm:h-[560px]"
        style={{ touchAction: "none" }}
      >
        <div ref={mapElRef} className="h-full w-full" />
      </div>

      {listMarkers.length === 0 ? (
        <p className="rounded-md border border-border bg-card px-3 py-6 text-center text-sm text-muted-foreground">
          Không tìm thấy điểm phù hợp với &quot;{searchQuery.trim()}&quot;.
        </p>
      ) : (
        <ul className="space-y-2 text-sm">
          {listMarkers.map((m) => {
            const active = m.id === selectedId;
            const near = nearIds.has(m.id);
            const dist = distances.get(m.id);
            return (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => focusMarker(m.id)}
                  className={cn(
                    "w-full rounded-md border px-3 py-2 text-left transition-colors",
                    near
                      ? "border-primary bg-primary/10"
                      : active
                        ? "border-primary/60 bg-primary/5"
                        : "border-border bg-card hover:border-primary/40",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{m.title}</p>
                      <p className="text-xs text-muted-foreground">{m.subtitle}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {dist != null
                          ? `Cách bạn ~${formatDistance(dist)}`
                          : `${m.lat.toFixed(5)}, ${m.lng.toFixed(5)}`}
                        {active && !near ? " · đang chọn" : ""}
                      </p>
                    </div>
                    {near && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary/15 px-2 py-1 text-xs font-medium text-primary">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Gần đây
                      </span>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
