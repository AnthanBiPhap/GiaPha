"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLockTouchGestures } from "@/hooks/use-lock-touch-gestures";
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

type LeafletMap = {
  remove: () => void;
  fitBounds: (bounds: unknown, opts?: { padding?: [number, number] }) => void;
  setView: (center: [number, number], zoom: number) => void;
  invalidateSize: () => void;
};

type LeafletModule = {
  map: (
    el: HTMLElement,
    opts?: { attributionControl?: boolean },
  ) => LeafletMap & {
    addLayer: (layer: unknown) => void;
  };
  tileLayer: (
    url: string,
    opts?: { attribution?: string; maxZoom?: number },
  ) => { addTo: (map: unknown) => void };
  marker: (latlng: [number, number]) => {
    addTo: (map: unknown) => { bindPopup: (html: string) => void };
    bindPopup: (html: string) => void;
  };
  featureGroup: (layers: unknown[]) => {
    getBounds: () => unknown;
  };
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
      // Fix default marker icons when loading from CDN
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

export function FamilyMap({ members }: Props) {
  const mapRef = useLockTouchGestures<HTMLDivElement>();
  const mapElRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<LeafletMap | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    if (markers.length === 0 || !mapElRef.current) return;

    let cancelled = false;

    void (async () => {
      try {
        const L = await loadLeaflet();
        if (cancelled || !mapElRef.current) return;

        mapInstanceRef.current?.remove();
        mapInstanceRef.current = null;

        const map = L.map(mapElRef.current, { attributionControl: false });
        mapInstanceRef.current = map;

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "",
          maxZoom: 19,
        }).addTo(map);

        const layers = markers.map((m) => {
          const marker = L.marker([m.lat, m.lng]);
          marker.bindPopup(
            `<strong>${escapeHtml(m.title)}</strong><br/><span style="font-size:12px;color:#555">${escapeHtml(m.subtitle)}</span>`,
          );
          marker.addTo(map);
          return marker;
        });

        if (layers.length === 1) {
          map.setView([markers[0].lat, markers[0].lng], 15);
        } else {
          const group = L.featureGroup(layers);
          map.fitBounds(group.getBounds(), { padding: [40, 40] });
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
    };
  }, [markers]);

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
      <p className="text-sm text-muted-foreground">
        {markers.length} vị trí · bấm ghim trên bản đồ để xem tên
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
      <ul className="space-y-2 text-sm">
        {markers.map((m) => (
          <li key={m.id} className="rounded-md border border-border bg-card px-3 py-2">
            <p className="font-medium">{m.title}</p>
            <p className="text-xs text-muted-foreground">{m.subtitle}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {m.lat.toFixed(5)}, {m.lng.toFixed(5)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
