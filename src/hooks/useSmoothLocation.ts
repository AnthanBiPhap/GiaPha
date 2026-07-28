"use client";

import { useEffect, useRef, useState } from "react";

export type SmoothLatLng = { lat: number; lng: number };

export type SmoothLocationState = {
  /** Vị trí đang hiển thị (đã nội suy) — dùng để vẽ marker */
  position: SmoothLatLng | null;
  /** Độ chính xác ước tính (mét) sau khi làm mượt */
  accuracy: number | null;
  /** Hướng di chuyển GPS (độ, 0 = Bắc), null nếu chưa có */
  heading: number | null;
  /** true khi accuracy ước tính < 20m */
  isReady: boolean;
  /** Lỗi geolocation nếu có */
  error: GeolocationPositionError | null;
};

type Options = {
  /** Bật/tắt watch GPS */
  enabled?: boolean;
  /** Tốc độ tối đa hợp lệ (m/s). > ngưỡng → bỏ reading (mặc định 30 ≈ 108km/h) */
  maxSpeedMps?: number;
  /** Thời gian nội suy marker (ms) */
  animMs?: number;
  /** accuracy dưới ngưỡng này → isReady */
  readyAccuracyM?: number;
};

const GEO_OPTS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 20000,
};

/** Haversine — khoảng cách mét giữa 2 điểm lat/lng */
function haversineMeters(a: SmoothLatLng, b: SmoothLatLng) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/**
 * GPS mượt: lọc nhiễu tốc độ + Kalman 1D đơn giản + nội suy RAF.
 * Thay cho việc setLngLat trực tiếp từ mỗi lần watchPosition.
 */
export function useSmoothLocation(options: Options = {}): SmoothLocationState {
  const {
    enabled = true,
    maxSpeedMps = 30,
    animMs = 400,
    readyAccuracyM = 20,
  } = options;

  const [position, setPosition] = useState<SmoothLatLng | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<GeolocationPositionError | null>(null);

  // --- Trạng thái bộ lọc (không trigger re-render mỗi bước nội bộ) ---
  const estimatedRef = useRef<SmoothLatLng | null>(null);
  const estimatedAccuracyRef = useRef<number>(50);
  const lastRawRef = useRef<{ pos: SmoothLatLng; t: number } | null>(null);
  const displayRef = useRef<SmoothLatLng | null>(null);
  const animFromRef = useRef<SmoothLatLng | null>(null);
  const animToRef = useRef<SmoothLatLng | null>(null);
  const animStartRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const lastHeadingRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      estimatedRef.current = null;
      lastRawRef.current = null;
      displayRef.current = null;
      setPosition(null);
      setAccuracy(null);
      setHeading(null);
      setIsReady(false);
      setError(null);
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    if (!navigator.geolocation) {
      setError({
        code: 2,
        message: "unsupported",
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      } as GeolocationPositionError);
      return;
    }

    /** Nội suy tuyến tính display → estimated trong animMs */
    const tickAnim = (now: number) => {
      const from = animFromRef.current;
      const to = animToRef.current;
      if (!from || !to) {
        rafRef.current = null;
        return;
      }
      const t = Math.min(1, (now - animStartRef.current) / animMs);
      const next = {
        lat: lerp(from.lat, to.lat, t),
        lng: lerp(from.lng, to.lng, t),
      };
      displayRef.current = next;
      setPosition(next);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tickAnim);
      } else {
        rafRef.current = null;
        animFromRef.current = to;
      }
    };

    const startAnimTo = (target: SmoothLatLng) => {
      const from = displayRef.current ?? target;
      animFromRef.current = from;
      animToRef.current = target;
      animStartRef.current = performance.now();
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(tickAnim);
    };

    const onPos = (pos: GeolocationPosition) => {
      setError(null);
      const newPos = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      };
      // accuracy từ thiết bị; fallback 30m nếu thiếu
      const newAccuracy =
        pos.coords.accuracy && pos.coords.accuracy > 0
          ? pos.coords.accuracy
          : 30;
      const now = pos.timestamp || Date.now();

      // --- 1) Rejection filter: tốc độ ước tính quá cao → bỏ ---
      const prev = lastRawRef.current;
      if (prev) {
        const dtSec = Math.max(0.001, (now - prev.t) / 1000);
        const dist = haversineMeters(prev.pos, newPos);
        const speed = dist / dtSec; // m/s
        if (speed > maxSpeedMps) {
          // Nhảy bất hợp lý (nhiễu GPS) — không cập nhật
          return;
        }
      }
      lastRawRef.current = { pos: newPos, t: now };

      // --- 2) Kalman 1D đơn giản (weighted by accuracy) ---
      let estimated = estimatedRef.current;
      let estAcc = estimatedAccuracyRef.current;

      if (!estimated) {
        // Lần đầu: tin ngay điểm đọc
        estimated = { ...newPos };
        estAcc = newAccuracy;
      } else {
        // weight cao → ước tính cũ kém chính xác → kéo mạnh về điểm mới
        const weight = estAcc / (estAcc + newAccuracy);
        estimated = {
          lat: estimated.lat + weight * (newPos.lat - estimated.lat),
          lng: estimated.lng + weight * (newPos.lng - estimated.lng),
        };
        // Độ chính xác cải thiện dần (cộng thông tin 1/σ)
        estAcc = 1 / (1 / estAcc + 1 / newAccuracy);
      }

      estimatedRef.current = estimated;
      estimatedAccuracyRef.current = estAcc;
      setAccuracy(estAcc);
      setIsReady(estAcc < readyAccuracyM);

      // Heading: giữ hướng cũ nếu GPS chưa báo (đứng yên thường null)
      const h = pos.coords.heading;
      if (typeof h === "number" && Number.isFinite(h) && h >= 0) {
        lastHeadingRef.current = h;
        setHeading(h);
      } else if (lastHeadingRef.current != null) {
        setHeading(lastHeadingRef.current);
      }

      // --- 3) Nội suy hiển thị thay vì nhảy tức thì ---
      if (!displayRef.current) {
        displayRef.current = estimated;
        setPosition(estimated);
      } else {
        startAnimTo(estimated);
      }
    };

    const onErr = (err: GeolocationPositionError) => {
      setError(err);
    };

    const watchId = navigator.geolocation.watchPosition(onPos, onErr, GEO_OPTS);

    return () => {
      navigator.geolocation.clearWatch(watchId);
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [enabled, maxSpeedMps, animMs, readyAccuracyM]);

  return { position, accuracy, heading, isReady, error };
}
