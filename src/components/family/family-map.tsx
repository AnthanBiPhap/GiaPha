"use client";

import { APIProvider, Map, AdvancedMarker, InfoWindow } from "@vis.gl/react-google-maps";
import { useMemo, useState } from "react";
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

export function FamilyMap({ members }: Props) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const [active, setActive] = useState<MarkerItem | null>(null);
  const mapRef = useLockTouchGestures<HTMLDivElement>();

  const markers = useMemo(() => {
    const items: MarkerItem[] = [];
    for (const m of members) {
      if (m.birth_lat != null && m.birth_lng != null) {
        items.push({
          id: `${m.id}-birth`,
          lat: m.birth_lat,
          lng: m.birth_lng,
          title: m.full_name,
          subtitle: `Nơi sinh: ${m.birth_place ?? "—"}`,
        });
      }
      if (m.death_lat != null && m.death_lng != null) {
        items.push({
          id: `${m.id}-death`,
          lat: m.death_lat,
          lng: m.death_lng,
          title: m.full_name,
          subtitle: `Nơi mất: ${m.death_place ?? "—"}`,
        });
      }
      if (m.current_lat != null && m.current_lng != null) {
        items.push({
          id: `${m.id}-current`,
          lat: m.current_lat,
          lng: m.current_lng,
          title: m.full_name,
          subtitle: `Quê quán / hiện tại: ${m.current_place ?? "—"}`,
        });
      }
    }
    return items;
  }, [members]);

  if (!apiKey) {
    return (
      <div className="rounded-md border border-border bg-card p-10 text-center text-sm text-muted-foreground">
        Thêm <code className="rounded bg-muted px-1">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> vào
        {" "}.env.local để hiển thị bản đồ. Bạn vẫn có thể nhập lat/lng thủ công trong form thành viên.
      </div>
    );
  }

  if (markers.length === 0) {
    return (
      <div className="rounded-md border border-border bg-card p-10 text-center text-sm text-muted-foreground">
        Chưa có tọa độ nào. Thêm lat/lng khi nhập nơi sinh / nơi mất / quê quán.
      </div>
    );
  }

  const center = { lat: markers[0].lat, lng: markers[0].lng };

  return (
    <div
      ref={mapRef}
      className="h-[min(60vh,480px)] touch-none overscroll-none overflow-hidden rounded-md border border-border sm:h-[560px]"
      style={{ touchAction: "none" }}
    >
      <APIProvider apiKey={apiKey}>
        <Map
          defaultCenter={center}
          defaultZoom={6}
          mapId="gia-pha-map"
          gestureHandling="greedy"
          disableDefaultUI={false}
        >
          {markers.map((m) => (
            <AdvancedMarker
              key={m.id}
              position={{ lat: m.lat, lng: m.lng }}
              onClick={() => setActive(m)}
            />
          ))}
          {active && (
            <InfoWindow
              position={{ lat: active.lat, lng: active.lng }}
              onCloseClick={() => setActive(null)}
            >
              <div className="p-1">
                <p className="font-medium">{active.title}</p>
                <p className="text-sm text-gray-600">{active.subtitle}</p>
              </div>
            </InfoWindow>
          )}
        </Map>
      </APIProvider>
    </div>
  );
}
