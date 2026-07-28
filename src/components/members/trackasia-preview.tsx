"use client";

import { useEffect, useRef } from "react";
import {
  loadTrackAsiaGl,
  trackAsiaStyleUrl,
  type TrackAsiaMap,
  type TrackAsiaMarker,
} from "@/lib/trackasia";

type Props = {
  lat: number;
  lng: number;
};

export function TrackAsiaPreview({ lat, lng }: Props) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<TrackAsiaMap | null>(null);
  const markerRef = useRef<TrackAsiaMarker | null>(null);

  useEffect(() => {
    if (!elRef.current) return;
    let cancelled = false;

    void (async () => {
      try {
        const gl = await loadTrackAsiaGl();
        if (cancelled || !elRef.current) return;

        mapRef.current?.remove();
        mapRef.current = null;
        markerRef.current = null;

        const map = new gl.Map({
          container: elRef.current,
          style: trackAsiaStyleUrl("v1"),
          center: [lng, lat],
          zoom: 15,
          attributionControl: false,
        });
        mapRef.current = map;

        map.on("load", () => {
          if (cancelled) return;
          const el = document.createElement("div");
          el.innerHTML =
            '<div style="width:18px;height:18px;border-radius:9999px;background:#46573f;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);"></div>';
          markerRef.current = new gl.Marker({ element: el, anchor: "center" })
            .setLngLat([lng, lat])
            .addTo(map);
          map.resize();
        });
      } catch {
        /* preview optional */
      }
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [lat, lng]);

  return <div ref={elRef} className="h-44 w-full" />;
}
