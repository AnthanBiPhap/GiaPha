/** TrackAsia Web SDK helpers — cùng style/key như TrackAsia docs */

/** Đọc trực tiếp process.env để Next inlined đúng NEXT_PUBLIC_* */
export function getTrackAsiaApiKey() {
  return (process.env.NEXT_PUBLIC_TRACKASIA_API_KEY ?? "").trim();
}

/** Style URL giống React Native / Web Quick Start */
export function trackAsiaStyleUrl(version: "v1" | "v2" = "v1") {
  const key = getTrackAsiaApiKey();
  if (!key) {
    throw new Error("Thiếu NEXT_PUBLIC_TRACKASIA_API_KEY trong .env.local");
  }
  return `https://maps.track-asia.com/styles/${version}/streets.json?key=${key}`;
}

export type LngLatLike = [number, number] | { lng: number; lat: number };

export type TrackAsiaPopup = {
  setHTML: (html: string) => TrackAsiaPopup;
  setLngLat: (lngLat: LngLatLike) => TrackAsiaPopup;
  addTo: (map: TrackAsiaMap) => TrackAsiaPopup;
  remove: () => void;
};

export type TrackAsiaMarker = {
  setLngLat: (lngLat: LngLatLike) => TrackAsiaMarker;
  setPopup: (popup: TrackAsiaPopup) => TrackAsiaMarker;
  addTo: (map: TrackAsiaMap) => TrackAsiaMarker;
  remove: () => void;
  getElement: () => HTMLElement;
  getPopup: () => TrackAsiaPopup | undefined;
  togglePopup: () => void;
};

export type TrackAsiaMap = {
  remove: () => void;
  resize: () => void;
  setCenter: (center: LngLatLike) => void;
  setZoom: (zoom: number) => void;
  flyTo: (opts: { center: LngLatLike; zoom?: number }) => void;
  fitBounds: (
    bounds: [[number, number], [number, number]],
    opts?: { padding?: number | { top: number; bottom: number; left: number; right: number }; maxZoom?: number },
  ) => void;
  on: (event: string, handler: () => void) => void;
  addControl: (control: unknown, position?: string) => void;
};

export type TrackAsiaGl = {
  Map: new (opts: {
    container: HTMLElement | string;
    style: string;
    center?: LngLatLike;
    zoom?: number;
    attributionControl?: boolean;
  }) => TrackAsiaMap;
  Marker: new (opts?: { element?: HTMLElement; anchor?: string }) => TrackAsiaMarker;
  Popup: new (opts?: { offset?: number | [number, number]; closeButton?: boolean }) => TrackAsiaPopup;
  NavigationControl: new (opts?: { showCompass?: boolean }) => unknown;
};

declare global {
  interface Window {
    trackasiagl?: TrackAsiaGl;
  }
}

export function loadTrackAsiaGl(): Promise<TrackAsiaGl> {
  return new Promise((resolve, reject) => {
    if (window.trackasiagl) {
      resolve(window.trackasiagl);
      return;
    }

    if (!document.getElementById("trackasia-gl-css")) {
      const link = document.createElement("link");
      link.id = "trackasia-gl-css";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/trackasia-gl@1.0.5/dist/trackasia-gl.css";
      document.head.appendChild(link);
    }

    const onReady = () => {
      if (!window.trackasiagl) {
        reject(new Error("TrackAsia GL không sẵn sàng"));
        return;
      }
      resolve(window.trackasiagl);
    };

    const existing = document.getElementById("trackasia-gl-js") as HTMLScriptElement | null;
    if (existing) {
      if (window.trackasiagl) onReady();
      else existing.addEventListener("load", onReady, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = "trackasia-gl-js";
    script.src = "https://unpkg.com/trackasia-gl@1.0.5/dist/trackasia-gl.js";
    script.async = true;
    script.onload = onReady;
    script.onerror = () => reject(new Error("Không tải được TrackAsia"));
    document.body.appendChild(script);
  });
}

type GeocodeResult = {
  formatted_address?: string;
  name?: string;
};

type GeocodeResponse = {
  status?: string;
  results?: GeocodeResult[];
};

/** Reverse geocode — TrackAsia API v2 (Google-compatible) */
export async function reverseGeocodeTrackAsia(
  lat: number,
  lng: number,
): Promise<string | null> {
  const key = getTrackAsiaApiKey();
  if (!key) return null;

  const url = new URL("https://maps.track-asia.com/api/v2/geocode/json");
  url.searchParams.set("latlng", `${lat},${lng}`);
  url.searchParams.set("key", key);
  url.searchParams.set("size", "1");
  url.searchParams.set("new_admin", "true");

  const res = await fetch(url.toString());
  if (!res.ok) return null;

  const data = (await res.json()) as GeocodeResponse;
  const first = data.results?.[0];
  return first?.formatted_address ?? first?.name ?? null;
}
