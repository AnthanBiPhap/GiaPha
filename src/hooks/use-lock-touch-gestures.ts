"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Stop the browser from hijacking pan/pinch on a canvas (pull-to-refresh,
 * page pinch-zoom). Requires non-passive listeners so preventDefault works.
 * Returns a callback ref so listeners attach when the element mounts.
 */
export function useLockTouchGestures<T extends HTMLElement>() {
  const cleanupRef = useRef<(() => void) | null>(null);

  const ref = useCallback((el: T | null) => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    if (!el) return;

    const block = (e: Event) => {
      e.preventDefault();
    };

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
    };

    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("gesturestart", block, { passive: false });
    el.addEventListener("gesturechange", block, { passive: false });

    cleanupRef.current = () => {
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("gesturestart", block);
      el.removeEventListener("gesturechange", block);
    };
  }, []);

  useEffect(() => () => cleanupRef.current?.(), []);

  return ref;
}

/**
 * Page-level: block multi-touch browser zoom and pull-to-refresh at scroll top.
 */
export function usePreventPageReloadGestures(enabled = true) {
  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;

    let startY = 0;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) startY = e.touches[0].clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        e.preventDefault();
        return;
      }

      const scrollTop = document.scrollingElement?.scrollTop ?? window.scrollY;
      if (scrollTop <= 0 && e.touches[0].clientY > startY) {
        e.preventDefault();
      }
    };

    const blockGesture = (e: Event) => {
      e.preventDefault();
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("gesturestart", blockGesture, { passive: false });

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("gesturestart", blockGesture);
    };
  }, [enabled]);
}
