"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Lock page scroll without position:fixed on body.
 * position:fixed on body breaks iOS fixed footer (moves while scrolling).
 */
function lockBodyScroll() {
  const body = document.body;
  if (body.dataset.touchScrollLock === "1") return;
  body.dataset.touchScrollLock = "1";
  body.style.overflow = "hidden";
  document.documentElement.style.overflow = "hidden";
}

function unlockBodyScroll() {
  const body = document.body;
  if (body.dataset.touchScrollLock !== "1") return;
  body.dataset.touchScrollLock = "";
  body.style.overflow = "";
  document.documentElement.style.overflow = "";
}

/**
 * Stop iOS Safari from stealing fast pan/pinch (rubber-band → pull-to-refresh).
 * Locks body scroll while fingers are on the canvas.
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

    const onTouchStart = () => {
      lockBodyScroll();
    };

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length === 0) unlockBodyScroll();
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });
    el.addEventListener("gesturestart", block, { passive: false });
    el.addEventListener("gesturechange", block, { passive: false });

    cleanupRef.current = () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
      el.removeEventListener("gesturestart", block);
      el.removeEventListener("gesturechange", block);
      unlockBodyScroll();
    };
  }, []);

  useEffect(() => () => cleanupRef.current?.(), []);

  return ref;
}

/**
 * Keep body non-bounceable while a canvas tab is open (iOS pull-to-refresh).
 */
export function usePreventPageReloadGestures(enabled = true) {
  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;

    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverscroll = html.style.overscrollBehavior;
    const prevBodyOverscroll = body.style.overscrollBehaviorY;

    html.style.overscrollBehavior = "none";
    body.style.overscrollBehaviorY = "none";

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
      html.style.overscrollBehavior = prevHtmlOverscroll;
      body.style.overscrollBehaviorY = prevBodyOverscroll;
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("gesturestart", blockGesture);
      unlockBodyScroll();
    };
  }, [enabled]);
}
